# AI Coding Guidelines

When working on this repository, please adhere to the following guidelines:

## General
- Use strict TypeScript.
- Prefer using `interfaces` and `type` aliases (or `structs` in Go) over `classes`.
- Minimize the use of third-party libraries. Stick to native APIs or lightweight, well-known libraries when necessary.
- **Do not touch any code in the `money_flow` directory.**
- **Always run `yarn type-check` and `yarn lint` to ensure there are no errors before committing any code.**

## Error Handling
- Use the `ts-error-as-value` library for error handling in TypeScript.
- Import the globals to convert functions that can throw exceptions to functions that return errors: `import "ts-error-as-value/lib/globals"`.
- Handle all errors in a Go-style manner (checking for `error` objects rather than using `try/catch` blocks).
- Always add context to errors when returning them. For example:
  ```typescript
  return err(new AggregateError([response.error], "failed to make request to proxy"));
  ```

## UI/State
- Use React for the UI.
- Use MobX for state management.

## Go/Serverless
- Serverless functions are written in Go.
- Handle errors idiomatically in Go, returning errors with appropriate context.
