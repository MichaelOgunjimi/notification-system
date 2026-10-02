import { type ApiPage, HttpClient, mapPage, query } from "./http";
import {
  CreateTemplateInputSchema,
  ImportTemplateInputSchema,
  UpdateTemplateInputSchema,
  UpsertTemplateInputSchema,
} from "./schemas";
import type {
  CreateTemplateInput,
  ImportTemplateInput,
  ImportTemplateResult,
  NotificationChannel,
  Page,
  RequestOptions,
  Template,
  TemplateListOptions,
  TemplatePreview,
  UpdateTemplateInput,
  UpsertTemplateInput,
} from "./types";

type ApiTemplate = {
  id: string;
  project_id: string | null;
  api_key_id: string | null;
  name: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  text_body: string | null;
  from_local: string | null;
  from_name: string | null;
  reply_to: string | null;
  variables: string[];
  detected_variables: string[];
  on_missing_variable: "error" | "blank";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ApiTemplatePreview = {
  subject: string | null;
  html: string;
  text: string;
  body: string;
  variables_used: string[];
  missing_variables: string[];
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
    textBody: value.text_body,
    fromLocal: value.from_local,
    fromName: value.from_name,
    replyTo: value.reply_to,
    variables: value.variables,
    detectedVariables: value.detected_variables,
    onMissingVariable: value.on_missing_variable,
    isActive: value.is_active,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function mapTemplateInput(value: CreateTemplateInput | UpdateTemplateInput | UpsertTemplateInput) {
  return {
    ...value,
    textBody: undefined,
    fromLocal: undefined,
    fromName: undefined,
    replyTo: undefined,
    onMissingVariable: undefined,
    text_body: value.textBody,
    from_local: value.fromLocal,
    from_name: value.fromName,
    reply_to: value.replyTo,
    on_missing_variable: value.onMissingVariable,
  };
}

function mapPreview(value: ApiTemplatePreview): TemplatePreview {
  return {
    subject: value.subject,
    html: value.html,
    text: value.text,
    body: value.body,
    variablesUsed: value.variables_used,
    missingVariables: value.missing_variables,
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
        body: mapTemplateInput(input),
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
        body: mapTemplateInput(input),
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
    return mapPreview(
      await this.http.request<ApiTemplatePreview>(`/templates/${id}/preview`, {
        method: "POST",
        body: { variables },
        signal: options.signal,
      }),
    );
  }

  /**
   * Creates or updates one template identified by project-scoped name and channel.
   * @param name - Project-unique template name.
   * @param input - Complete template content to synchronize.
   * @param channel - Delivery channel, defaulting to email.
   * @param options - Optional cancellation signal.
   * @returns The created or updated template.
   * @throws {ZodError} When `input` fails local schema validation.
   * @throws {BeacoError} When the API rejects the request.
   */
  async upsertByName(
    name: string,
    input: UpsertTemplateInput,
    channel: NotificationChannel = "email",
    options: RequestOptions = {},
  ): Promise<Template> {
    name = CreateTemplateInputSchema.shape.name.parse(name);
    channel = CreateTemplateInputSchema.shape.channel.parse(channel);
    input = UpsertTemplateInputSchema.parse(input);
    return mapTemplate(
      await this.http.request<ApiTemplate>(
        `/templates/by-name/${encodeURIComponent(name)}?channel=${encodeURIComponent(channel)}`,
        {
          method: "PUT",
          body: mapTemplateInput(input),
          signal: options.signal,
        },
      ),
    );
  }

  /**
   * Imports plain HTML by replacing unambiguous sample values in text nodes.
   * @param input - Template identity, HTML, and sample values.
   * @param options - Optional cancellation signal.
   * @returns The created template and rendered sample preview.
   * @throws {ZodError} When `input` fails local schema validation.
   * @throws {BeacoError} When replacement is ambiguous or the API rejects the request.
   */
  async importHtml(
    input: ImportTemplateInput,
    options: RequestOptions = {},
  ): Promise<ImportTemplateResult> {
    input = ImportTemplateInputSchema.parse(input);
    const value = await this.http.request<{
      template: ApiTemplate;
      preview: ApiTemplatePreview;
    }>("/templates/import", {
      method: "POST",
      body: input,
      signal: options.signal,
    });
    return { template: mapTemplate(value.template), preview: mapPreview(value.preview) };
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
