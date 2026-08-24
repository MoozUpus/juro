export const UPDATE_LAWYER_CONSULTATION_TRANSITION_SQL =
  "UPDATE lawyer_consultations SET status=?,attendance_outcome=CASE WHEN ?='no_show' THEN 'no_show' ELSE attendance_outcome END,result_note=CASE WHEN ?='complete' THEN ? ELSE result_note END,updated_at=? WHERE id=?";
