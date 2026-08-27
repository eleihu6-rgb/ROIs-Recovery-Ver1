#pragma once

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckCOFMultipleQualsForTGRuleParam;

class CheckCOFMultipleQualsForTGRuleParam : public RuleParam {
	friend class CheckCOFMultipleQualsForTGRule;
private:
	explicit CheckCOFMultipleQualsForTGRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7013;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 10;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		PILOT = 4,
		FLIGHT_NUMBERS = 5,
		AIRPORTS = 6,
		ATTRIBUTES = 7,
		ASSIGNMENTS = 8,
		ACTING_RANKS = 9,
		QUALS = 10,
		FLIGHT_ASSIGNMENTS = 11
	};

	std::vector<std::string> _bases{};
	std::vector<std::string> _ranks{};
	std::vector<std::string> _fleets{};
	std::vector<std::string> _teams{};
	int _pilot{};
	std::vector<std::string> _flightNumbers{};
	std::vector<std::string> _flightAssignments{};
	std::vector<std::string> _airports{};
	std::vector<std::string> _attributes{};
	std::vector<std::string> _assignments{};
	std::vector<std::string> _actingRanks{};
	std::vector<std::string> _quals{};


	//任务类型,使用“|”分隔，表示多个值


	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;


};
