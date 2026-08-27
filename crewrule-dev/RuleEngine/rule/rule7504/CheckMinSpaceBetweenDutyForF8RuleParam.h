/**
 * @file CheckMinSpaceBetweenDutyForF8RuleParam.h
 * @brief Parameters for 7504 CheckMinSpaceBetweenDutyForF8 (mirrored from 7323).
**/

#ifndef _CHECKMINSPACEBETWEENDUTYFORF8RULEPARAM_H_
#define _CHECKMINSPACEBETWEENDUTYFORF8RULEPARAM_H_

#include "CrewDB.h"
#include "RuleParam.h"
#include <string>

class CheckMinSpaceBetweenDutyForF8Rule;
class WorkPeriod;
class Period;
class Duty;
class Pairing;

class CheckMinSpaceBetweenDutyForF8RuleParam : public RuleParam {
	friend class CheckMinSpaceBetweenDutyForF8Rule;
private:
	explicit CheckMinSpaceBetweenDutyForF8RuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7504;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		PREV_ASSIGNMENT_GROUPS = 4,
		NEXT_ASSIGNMENT_GROUPS = 5,
		PREV_ASSIGNMENTS = 6,
		NEXT_ASSIGNMENTS = 7,
		PREV_ATTRIBUTES = 8,
		NEXT_ATTRIBUTES = 9,
		APPLY_PRELABELLED_ATTRIBUTES = 10,
		LEVEL = 11,
		MIN_PERIOD = 12,
		UNIT = 13,
		UTILIZE_POST_REST = 14
	};

	std::vector<std::string> _bases{};
	std::vector<std::string> _ranks{};
	std::vector<std::string> _fleets{};
	std::vector<std::string> _teams{};
	std::vector<std::string> _prevAssignmentGroups{};
	std::vector<std::string> _nextAssignmentGroups{};
	std::vector<std::string> _prevAssignments{};
	std::vector<std::string> _nextAssignments{};
	std::vector<std::string> _prevAttributes{};
	std::vector<std::string> _nextAttributes{};

	// When true (default), PREV/NEXT attribute matching includes pairing prelabelled (pairing-level) attributes; when false, duty + roster only.
	// For WOCL in PREV/NEXT ATTRIBUTES: when true, WOCL shape uses pairing attribute text; when false, uses IsWoclDutyLike7503 time window.
	bool _applyPrelabelledAttributes = true;

	// Rule row scope / level (stored as configured; "*" means unrestricted until used by rule logic).
	std::string _level{ "*" };

	int _minPeriod{};
	std::string _unit{};

	/// Same as rule 8056 / RestPeriod::GetWorkEndTime*ForRoster: when Y, rest gap starts from previous block endTime; when N, from endTimeIncludingRest (post-rest included).
	bool _utilizePostRest = true;

	void ParseParam(const DBRule& dbRule);

	bool prevAttributesRequireWocl() const;
	bool nextAttributesRequireWocl() const;

	bool MatchPrevAssgsOnDutyLevel(const WorkPeriod* wp) const;
	bool MatchNextAssgsOnDutyLevel(const WorkPeriod* wp) const;
	bool MatchPrevAttributesOnlyDuty(const WorkPeriod* wp) const;
	bool MatchNextAttributesOnlyDuty(const WorkPeriod* wp) const;

	bool MatchPrevAssgsOnPairingLevel(const ROSTER* roster) const;
	bool MatchNextAssgsOnPairingLevel(const ROSTER* roster) const;
	bool MatchPrevAttributesOnlyRoster(const ROSTER* roster) const;
	bool MatchNextAttributesOnlyRoster(const ROSTER* roster) const;

	/// True when LEVEL is P (roster/pairing row spacing); otherwise duty WorkPeriod level (D, *, etc.).
	bool isRosterPairingLevel() const;

	bool matchPrevWoclShapeWorkPeriod(const WorkPeriod* wp, int offsetTZMinutes) const;
	bool matchNextWoclShapeWorkPeriod(const WorkPeriod* wp, int offsetTZMinutes) const;
	bool matchPrevWoclShapeRoster(const ROSTER* roster, int crewBaseOffsetTZMinutes) const;
	bool matchNextWoclShapeRoster(const ROSTER* roster, int crewBaseOffsetTZMinutes) const;
	bool matchPrevWoclShapeInPairing(const Duty* duty, const Pairing* pairing, int fallbackOffsetTZMinutes) const;
	bool matchNextWoclShapeInPairing(const Duty* duty, const Pairing* pairing, int fallbackOffsetTZMinutes) const;

public:

	enum class WarnCode {
		NO_WARN = 0,
	};

	bool MatchRuleParam(WorkPeriod* currentWokrPeriod, WorkPeriod* nextWorkPeriod, int offsetTZMinutes) const;
	bool MatchRuleParam(const Duty* currentWokrPeriod, const Duty* nextWorkPeriod) const;

	bool MatchAssignment(const WorkPeriod* currentWokrPeriod, const WorkPeriod* nextWorkPeriod) const;
	bool MatchAssignment(const Duty* currentWokrPeriod, const Duty* nextWorkPeriod) const;

	/// Prev/next shape for roster WorkPeriod timeline (assignment groups + assignments + attributes incl. WOCL).
	bool MatchesPrevDutyPattern(const WorkPeriod* wp, int offsetTZMinutes) const;
	bool MatchesNextDutyPattern(const WorkPeriod* wp, int offsetTZMinutes) const;

	/// Same prev/next pattern as WorkPeriod mode, evaluated on one roster row (pairing or ground), for LEVEL P.
	/// When APPLY_PRELABELLED_ATTRIBUTES is Y, PREV/NEXT ATTRIBUTES match only pairing->getAttribute() (no WOCL special-case); when N, WOCL is stripped from attribute crit and time-window WOCL uses match*WoclShapeRoster.
	bool MatchesPrevPairingPattern(const ROSTER* roster, int crewBaseOffsetTZMinutes) const;
	bool MatchesNextPairingPattern(const ROSTER* roster, int crewBaseOffsetTZMinutes) const;

	bool CheckMinRest(const time_t restStartTime, const time_t restEndTime, int restStartOffset, int restEndOffset) const;

	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;
};

#endif //_CHECKMINSPACEBETWEENDUTYFORF8RULEPARAM_H_
