export type TranslateField = "title" | "summary" | "content" | "ai_reason"

export interface TranslatePart {
  field: TranslateField
  text: string
}
