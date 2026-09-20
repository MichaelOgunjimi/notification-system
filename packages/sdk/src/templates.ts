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
  constructor(private readonly http: HttpClient) {}

  /**
   * Creates a template owned by the configured project.
   * @param input Template content and variables.
   * @param options Optional cancellation signal.
   * @returns The created template.
   * @throws A `BeacoError` when validation or the request fails.
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
   * @param options Filters, pagination, and optional cancellation signal.
   * @returns One page of templates.
   * @throws A `BeacoError` when the request fails.
   */
  async list(options: TemplateListOptions = {}): Promise<Page<Template>> {
    const page = await this.http.request<ApiPage<ApiTemplate>>(`/templates${query(options)}`, {
      signal: options.signal,
    });
    return mapPage(page, mapTemplate);
  }

  /**
   * Retrieves one template by identifier.
   * @param id Template identifier.
   * @param options Optional cancellation signal.
   * @returns The requested template.
   * @throws A `BeacoError` when the template is unavailable or the request fails.
   */
  async retrieve(id: string, options: RequestOptions = {}): Promise<Template> {
    return mapTemplate(await this.http.request<ApiTemplate>(`/templates/${id}`, options));
  }

  /**
   * Replaces the supplied fields on an owned template.
   * @param id Template identifier.
   * @param input Fields to update.
   * @param options Optional cancellation signal.
   * @returns The updated template.
   * @throws A `BeacoError` when validation, ownership, or the request fails.
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
   * @param id Template identifier.
   * @param variables Values used during rendering.
   * @param options Optional cancellation signal.
   * @returns Rendered subject and body.
   * @throws A `BeacoError` when rendering or the request fails.
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
   * @param id Template identifier.
   * @param options Optional cancellation signal.
   * @returns Nothing after successful deletion.
   * @throws A `BeacoError` when ownership or the request fails.
   */
  async delete(id: string, options: RequestOptions = {}): Promise<void> {
    await this.http.request<void>(`/templates/${id}`, {
      method: "DELETE",
      signal: options.signal,
    });
  }
}
