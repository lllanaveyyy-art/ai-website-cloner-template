import { describe, expect, it } from "vitest";
import { analyseLead, analysisSchema, fallbackAnalysis, followUpHours, leadInputSchema } from "../src/lib/workflow";

describe("workflow business logic", () => {
  it("classifies an urgent 35-person CRM request as high priority in fallback mode", () => {
    const result=fallbackAnalysis({companySize:35,serviceNeeded:"CRM Implementation",budgetRange:"$25k–$50k",message:"We need to migrate our spreadsheets before January."});
    expect(result.priority).toBe("High");
    expect(result.category).toBe("CRM Implementation");
    expect(result.department).toBe("Solutions");
  });

  it("uses priority-based follow-up rules", () => {
    expect(followUpHours("High")).toBe(2);
    expect(followUpHours("Normal")).toBe(24);
    expect(followUpHours("Low")).toBe(48);
  });

  it("rejects invalid lead input before workflow execution", () => {
    const result=leadInputSchema.safeParse({name:"A",company:"X",email:"bad",serviceNeeded:"CRM",message:"tiny",idempotencyKey:"bad"});
    expect(result.success).toBe(false);
  });

  it("rejects invalid structured AI output", () => {
    const result=analysisSchema.safeParse({category:"CRM",requestType:"Implementation",urgency:"ASAP",estimatedValue:"High",department:"Sales",priority:"High",summary:"short",recommendedAction:"call"});
    expect(result.success).toBe(false);
  });
  it("keeps live AI disabled by default so fallback remains zero-cost", async () => {
    const previous = process.env.LIVE_AI_ENABLED;
    delete process.env.LIVE_AI_ENABLED;
    await expect(analyseLead({
      idempotencyKey:"00000000-0000-4000-8000-000000000001",
      name:"Demo User",
      company:"Demo Company",
      email:"demo@example.com",
      phone:"",
      companySize:12,
      serviceNeeded:"Workflow Automation",
      budgetRange:"$5k–$15k",
      message:"We need a safe portfolio workflow automation demo."
    })).rejects.toThrow(/deterministic fallback/i);
    if (previous === undefined) delete process.env.LIVE_AI_ENABLED;
    else process.env.LIVE_AI_ENABLED = previous;
  });
});
