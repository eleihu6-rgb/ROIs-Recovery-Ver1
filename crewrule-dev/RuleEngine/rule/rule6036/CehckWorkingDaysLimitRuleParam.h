#pragma once
#pragma once
#pragma once
#pragma once
#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CehckWorkingDaysLimitRuleParam;

class CehckWorkingDaysLimitRuleParam : public RuleParam {
	friend class CehckWorkingDaysLimitRule;
private:
	explicit CehckWorkingDaysLimitRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 6036;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 14;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		DUTY_ASSIGNMENTS = 3,
		MIN_TIMES = 4
	};

	std::vector<string> _bases{};

	std::vector<string> _ranks{};

	std::vector<string> _fleets{};

	std::string _excludingTeams{};

	//任务类型
	std::vector<string> _dutyAssignments{};
	//最小次数
	int _minTimes{};

	void ParseParam(const DBRule& dbRule);


};
