import { safety } from "./deps.ts";

/**
 * Health Check Response Format for HTTP APIs (draft-inadarei-api-health-check-01)
 * See: https://tools.ietf.org/id/draft-inadarei-api-health-check-01.html
 */

/**
  * Status: (required) indicates whether the service status is acceptable or not. API publishers SHOULD use following values for the field:
  *   “pass”: healthy,
  *   “fail”: unhealthy, and
  *   “warn”: healthy, with some concerns.
  * The value of the status field is tightly related with the HTTP response code returned by the health endpoint. For “pass” and “warn” statuses 
  * HTTP response code in the 2xx-3xx range MUST be used. For “fail” status HTTP response code in the 4xx-5xx range MUST be used. In case of the
  * “warn” status, endpoint SHOULD return HTTP status in the 2xx-3xx range and additional information SHOULD be provided, utilizing optional
  * fields of the response.
  */
export type ServiceHealthState = "pass" | "fail" | "warn";
export type ServiceHealthLinks = Record<string, string>;

export interface ServiceHealthStatusable {
  status: ServiceHealthState;
}

export const isServiceHealthStatus = safety.typeGuard<ServiceHealthStatusable>(
  "status",
);

export interface ServiceHealthDiagnosable {
  output: string;
  notes?: string[];
}

export const isServiceHealthDiagnosable = safety.typeGuard<
  ServiceHealthDiagnosable
>("output");

export interface ServiceHealthVersioned {
  version: string;
  releaseID: string;
}

export const isServiceHealthVersioned = safety.typeGuard<
  ServiceHealthVersioned
>("version", "releaseID");

export interface ServiceHealthComponents {
  details: Record<ServiceHealthComponentName, ServiceHealthComponentDetails>;
}

export const isServiceHealthComponents = safety.typeGuard<
  ServiceHealthComponents
>("details");

export interface ServiceHealthLinkable {
  links: ServiceHealthLinks;
}

export const isServiceHealthLinkable = safety.typeGuard<
  ServiceHealthLinkable
>("links");

export interface ServiceHealthIdentity {
  serviceID: string;
  description: string;
}

export const isServiceHealthIdentity = safety.typeGuard<
  ServiceHealthIdentity
>("serviceID", "description");

export interface HealthyServiceStatus
  extends
    ServiceHealthStatusable,
    ServiceHealthVersioned,
    Partial<ServiceHealthLinkable>,
    Partial<ServiceHealthComponents>,
    Partial<ServiceHealthIdentity> {
  status: "pass";
}

export interface UnhealthyServiceStatus
  extends
    ServiceHealthStatusable,
    ServiceHealthVersioned,
    ServiceHealthDiagnosable,
    ServiceHealthComponents,
    ServiceHealthIdentity,
    Partial<ServiceHealthLinkable> {
  status: "fail" | "warn";
}

export type HealthServiceStatus = HealthyServiceStatus | UnhealthyServiceStatus;

export interface HealthServiceStatusEndpoint {
  readonly headers: Record<string, string>;
  readonly body: HealthServiceStatus;
}

export function isHealthy(o: unknown): o is HealthyServiceStatus {
  if (isServiceHealthStatus(o)) {
    if (o.status === "pass") return true;
  }
  return false;
}

export function isUnhealthy(o: unknown): o is UnhealthyServiceStatus {
  if (isServiceHealthStatus(o)) {
    if (o.status !== "pass") return true;
  }
  return false;
}

export type TypicalServiceHealthMetricName =
  | "utilization"
  | "responseTime"
  | "connections"
  | "uptime";

export type ServiceHealthMetricValue =
  | string
  | number
  | Date
  | Record<string, unknown>
  | Array<unknown>;

export interface ServiceHealthMetric {
  metricName: TypicalServiceHealthMetricName | string;
  metricValue: ServiceHealthMetricValue;
  metricUnit: string;
}

export type ServiceHealthComponentName = string;
export type ServiceHealthComponentType = "component" | "datastore" | "system";

export interface ServiceHealthComponent {
  componentId: string;
  componentType: ServiceHealthComponentType;
}

export interface HealthyServiceHealthComponentStatus
  extends
    ServiceHealthStatusable,
    ServiceHealthComponent,
    Partial<ServiceHealthMetric>,
    ServiceHealthLinkable {
  time: Date;
  node?: string;
}

export interface UnhealthyServiceHealthComponentStatus
  extends
    ServiceHealthStatusable,
    ServiceHealthComponent,
    Partial<ServiceHealthMetric>,
    ServiceHealthDiagnosable,
    ServiceHealthLinkable {
  time: Date;
  node?: string;
}

export type ServiceHealthComponentStatus =
  | HealthyServiceHealthComponentStatus
  | UnhealthyServiceHealthComponentStatus;
export type ServiceHealthComponentDetails = ServiceHealthComponentStatus[];

export function healthyService(
  report: Omit<HealthyServiceStatus, "status">,
): HealthyServiceStatus {
  return {
    status: "pass",
    ...report,
  };
}

export function healthyComponent(
  report: Omit<HealthyServiceHealthComponentStatus, "status">,
): HealthyServiceHealthComponentStatus {
  return {
    status: "pass",
    ...report,
  };
}

export function healthStatusEndpoint(
  report: HealthServiceStatus,
): HealthServiceStatusEndpoint {
  return {
    headers: {
      "Content-Type": "application/health+json",
      "Cache-Control": "max-age=3600",
    },
    body: report,
  };
}

export function unhealthyService(
  status: "fail" | "warn",
  report: Omit<UnhealthyServiceStatus, "status">,
): UnhealthyServiceStatus {
  return {
    status: status,
    ...report,
  };
}

export function unhealthyComponent(
  status: "fail" | "warn",
  report: Omit<UnhealthyServiceHealthComponentStatus, "status">,
): UnhealthyServiceHealthComponentStatus {
  return {
    status: status,
    ...report,
  };
}
