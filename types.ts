export type TRequestResult = {
	startsAt: number;
	completedAt: number;
	durationMs: number;
	workerId: string;
	requestId: number;
	sequenceId: string;
	successful: boolean;
	status: number;
	result: unknown;
};

export type TSessionResult = {
	requestsSucceeded: number;
	requestsFailed: number;
	totalRequests: number;
	minRequestDelay: number;
	maxRequestDelay: number;
	minExecutionTime: number;
	maxExecutionTime: number;
	avgExecutionTime: number;
	flattenedResults: TRequestResult[];
};

export interface Env {
	service_token: string;
	loic_token: string;
	basic_auth?: string;
	bypass_key?: string;
	bypass_value?: string;
}
