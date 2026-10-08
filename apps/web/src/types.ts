/** 前端类型入口：API 契约从 @triptrace/contracts 复用（前后端同源类型）。 */

export type {
  ApiErrorBody,
  AuthResponse,
  BulkImportResponse,
  ImportEntry,
  ImportParseResult,
  Leg,
  MeResponse,
  OkResponse,
  TabKey,
  TripDto,
  TripDto as Trip,
  TripListResponse,
  TripPayload,
  TripResponse,
  UserDto,
  UserDto as User,
} from "@triptrace/contracts";

export interface ToastMessage {
  id: number;
  text: string;
  kind: "info" | "error";
}
