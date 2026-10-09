import { Request, Response } from "express";

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export function jsonSuccess<T>(res: Response, data: T, message?: string, statusCode = 200) {
  const response: ApiResponse<T> = { success: true, data, message };
  return res.status(statusCode).json(response);
}

export function jsonError(res: Response, message: string, statusCode = 400) {
  const response: ApiResponse = { success: false, error: message };
  return res.status(statusCode).json(response);
}
