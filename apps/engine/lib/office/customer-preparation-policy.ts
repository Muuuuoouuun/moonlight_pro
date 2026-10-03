import { OFFICE_CUSTOMER_PREPARATION_VERSION, type OfficeWorkflowAnswer, type OfficeWorkflowContext, type OfficeWorkflowRequest } from '@com-moon/agent-contracts/office-workflow';

const MISSING_CUSTOMER_WORDS_QUESTION = '고객이 직접 말한 문의와 지켜야 할 약속의 원문을 확인해 주세요.';

// Preserve a source gap the server has actually observed. This adds a review
// question; it never invents facts, changes the reply or creates a task.
export function groundOfficeCustomerPreparation(answer: OfficeWorkflowAnswer, request: OfficeWorkflowRequest, context: OfficeWorkflowContext): OfficeWorkflowAnswer {
  if (request.customerPreparationVersion !== OFFICE_CUSTOMER_PREPARATION_VERSION || !answer.customerPreparation
    || !context.missing.includes('recorded-customer-words-unavailable')) return answer;
  return { ...answer, customerPreparation: { ...answer.customerPreparation,
    questions: [...new Set([MISSING_CUSTOMER_WORDS_QUESTION, ...answer.customerPreparation.questions])].slice(0, 6) } };
}
