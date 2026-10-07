# Client tools for the ElevenLabs agent

Create each as **Tool type: Client**, **Wait for response: ON** (`expects_response: true`), response timeout 20 s.
Names and parameter identifiers must match exactly — the `/call` page registers handlers with these names.

| Name | Description (paste as is) | Parameters |
|---|---|---|
| `search_policy` | Search Fernleaf Clinic's internal policies for fees, insurance, timings, location, test preparation and department rules. Call before answering any such question. | `query` (string, required): the patient's question rephrased as a search query |
| `check_availability` | Find open appointment slots. Returns up to three options with a slot_id and a spoken description. | `specialty` (string, optional), `doctor_name` (string, optional), `day_preference` (string, optional, in the patient's words), `time_preference` (string, optional: morning, afternoon, evening or any) |
| `book_appointment` | Book the slot the patient chose. | `slot_id` (number, required), `patient_name` (string, required), `patient_phone` (string, optional), `reason` (string, required) |
| `save_intake` | Save pre-visit intake answers for the doctor. Call after each answer with everything known so far. | `chief_complaint` (string, required), `duration` (string, optional), `severity` (string, optional), `current_medications` (string, optional), `notes` (string, optional) |
| `flag_for_staff` | Escalate to human staff for anything you cannot handle or any emergency. | `reason` (string, required), `urgency` (string, required: routine, urgent or emergency) |

What each tool returns (from `/api/tools/<name>`): a JSON string of the result, or a speakable message on failure. A 6-second client-side timeout returns a polite fallback so the agent never hangs.
