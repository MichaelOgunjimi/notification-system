# Notification Platform

The platform accepts notification events for isolated customer workspaces and delivers them through configured channels.

## Language

**User**:
A human identity that signs in to manage the platform.
_Avoid_: API client, account

**Organization**:
The customer workspace that owns memberships, projects, aggregate usage, audit history, and a future subscription.
_Avoid_: Tenant, account

**Organization Membership**:
A user's role-based access to one organization and, initially, all of its projects.
_Avoid_: Project membership

**Project**:
An isolated collection of notification resources, API keys, usage, and audit history within an organization.
_Avoid_: Workspace, app

**API Key**:
A project credential used by software to call notification endpoints with explicit scopes.
_Avoid_: User token, tenant

**Tenancy**:
The domain area governing organizations, memberships, projects, access, audit attribution, usage rollups, and billing ownership.
_Avoid_: Authentication

## Relationships

- A **User** has zero or more **Organization Memberships**
- An **Organization** has one or more **Organization Memberships** and zero or more **Projects**
- A **Project** belongs to exactly one **Organization** and has zero or more **API Keys**
- An **Organization** owns the future subscription; its **Projects** contribute usage to it

## Example dialogue

> **Dev:** "Does an **API Key** identify the customer subscription?"
> **Domain expert:** "No. The **API Key** authenticates a **Project**; the **Organization** owns the subscription and aggregates project usage."

## Flagged ambiguities

- "account" can mean a signed-in **User**, an OAuth identity, or an **Organization**; use the specific term instead.
- "project owner" currently means an **Organization** owner or admin managing a **Project**; there is no separate project membership model yet.
