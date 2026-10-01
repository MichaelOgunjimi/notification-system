import { type ApiPage, HttpClient, mapPage, query } from "./http";
import { CreateTemplateInputSchema, UpdateTemplateInputSchema } from "./schemas";
import type {
  CreateTemplateInput,
  NotificationChannel,
  Page,
  RequestOptions,
  Template,
  TemplateListOptions,
  TemplatePreview,
  UpdateTemplateInput,
} from "./types";

type ApiTemplate = {
  id: string;
  project_id: string | null;
  api_key_id: string | null;
  name: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** @internal Converts the REST template representation to the public camelCase model. */
function mapTemplate(value: ApiTemplate): Template {
  return {
    id: value.id,
    projectId: value.project_id,
    apiKeyId: value.api_key_id,
    name: value.name,
    channel: value.channel,
    subject: value.subject,
    body: value.body,
    variables: value.variables,
    isActive: value.is_active,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

/** Creates, previews, updates, and removes delivery templates. */
export class TemplatesResource {
  /** @internal Creates template operations over a shared authenticated transport. */
  constructor(private readonly http: HttpClient) {}

  /**
   * Creates a template owned by the configured project.
   * This operation stores a project-scoped template for future event delivery.
   *
   * @param input - Template name, channel, content, and declared render variables.
   * @param options - Optional cancellation signal. Aborting it cancels the HTTP request.
   * @returns The newly created template.
   * @throws {ZodError} When `input` fails local schema validation.
   * @throws {BeacoError} When validation, authorization, or the API request fails.
   */
  async create(input: CreateTemplateInput, options: RequestOptions = {}): Promise<Template> {
    input = CreateTemplateInputSchema.parse(input);
    return mapTemplate(
      await this.http.request<ApiTemplate>("/templates", {
        method: "POST",
        body: input,
        signal: options.signal,
      }),
    );
  }

  /**
   * Lists templates available to the configured project.
   * @param options - Channel filter, pagination, and an optional cancellation signal.
   * @returns One page of templates and pagination metadata.
   * @throws {BeacoError} When the API rejects the request or cannot be reached.
   */
  async list(options: TemplateListOptions = {}): Promise<Page<Template>> {
    const page = await this.http.request<ApiPage<ApiTemplate>>(`/templates${query(options)}`, {
      signal: options.signal,
    });
    return mapPage(page, mapTemplate);
  }

  /**
   * Retrieves one template by identifier.
   * @param id - Unique template identifier.
   * @param options - Optional cancellation signal. Aborting it cancels the HTTP request.
   * @returns The requested template.
   * @throws {BeacoError} When the template is unavailable or the request cannot be completed.
   */
  async retrieve(id: string, options: RequestOptions = {}): Promise<Template> {
    return mapTemplate(await this.http.request<ApiTemplate>(`/templates/${id}`, options));
  }

  /**
   * Replaces the supplied fields on an owned template.
   * This operation mutates the stored template; fields omitted from `input` remain unchanged.
   *
   * @param id - Unique template identifier.
   * @param input - Editable fields to replace. Set `subject` to `null` to clear it.
   * @param options - Optional cancellation signal. Aborting it cancels the HTTP request.
   * @returns The updated template.
   * @throws {ZodError} When `input` fails local schema validation.
   * @throws {BeacoError} When validation, ownership, or the API request fails.
   */
  async update(
    id: string,
    input: UpdateTemplateInput,
    options: RequestOptions = {},
  ): Promise<Template> {
    input = UpdateTemplateInputSchema.parse(input);
    return mapTemplate(
      await this.http.request<ApiTemplate>(`/templates/${id}`, {
        method: "PUT",
        body: input,
        signal: options.signal,
      }),
    );
  }

  /**
   * Renders a template without sending a notification.
   * This operation does not create an event or notification.
   *
   * @param id - Unique template identifier.
   * @param variables - Values substituted into the template body and subject.
   * @param options - Optional cancellation signal. Aborting it cancels the HTTP request.
   * @returns Rendered subject and body.
   * @throws {BeacoError} When rendering fails or the request cannot be completed.
   */
  async preview(
    id: string,
    variables: Record<string, unknown>,
    options: RequestOptions = {},
  ): Promise<TemplatePreview> {
    return this.http.request<TemplatePreview>(`/templates/${id}/preview`, {
      method: "POST",
      body: { variables },
      signal: options.signal,
    });
  }

  /**
   * Soft-deletes an owned template.
   * The template becomes unavailable for future sends; historical delivery records remain.
   *
   * @param id - Unique template identifier.
   * @param options - Optional cancellation signal. Aborting it cancels the HTTP request.
   * @returns Nothing after successful deletion.
   * @throws {BeacoError} When ownership validation fails or the request cannot be completed.
   */
  async delete(id: string, options: RequestOptions = {}): Promise<void> {
    await this.http.request<void>(`/templates/${id}`, {
      method: "DELETE",
      signal: options.signal,
    });
  }
}
