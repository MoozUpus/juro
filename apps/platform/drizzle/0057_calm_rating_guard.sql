CREATE TRIGGER `lawyer_reviews_rating_range_insert`
BEFORE INSERT ON `lawyer_reviews`
WHEN NEW.`overall_rating` NOT BETWEEN 1 AND 5
  OR NEW.`speed_rating` NOT BETWEEN 1 AND 5
  OR NEW.`quality_rating` NOT BETWEEN 1 AND 5
  OR NEW.`communication_rating` NOT BETWEEN 1 AND 5
BEGIN
  SELECT RAISE(ABORT, 'lawyer review ratings must be between 1 and 5');
END;
--> statement-breakpoint
CREATE TRIGGER `lawyer_reviews_rating_range_update`
BEFORE UPDATE OF `overall_rating`,`speed_rating`,`quality_rating`,`communication_rating` ON `lawyer_reviews`
WHEN NEW.`overall_rating` NOT BETWEEN 1 AND 5
  OR NEW.`speed_rating` NOT BETWEEN 1 AND 5
  OR NEW.`quality_rating` NOT BETWEEN 1 AND 5
  OR NEW.`communication_rating` NOT BETWEEN 1 AND 5
BEGIN
  SELECT RAISE(ABORT, 'lawyer review ratings must be between 1 and 5');
END;
