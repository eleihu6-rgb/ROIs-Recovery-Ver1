#pragma once
#pragma once
#pragma once
#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckMaxConsecutiveNightsAwayFromBaseRuleParam;

class CheckMaxConsecutiveNightsAwayFromBaseRuleParam : public RuleParam {
	friend class CheckMaxConsecutiveNightsAwayFromBaseRule;
private:
	explicit CheckMaxConsecutiveNightsAwayFromBaseRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 6035;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 14;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		MAX_TIMES = 3
	};

	std::vector<string> _bases{};

	std::vector<string> _ranks{};

	std::vector<string> _fleets{};

	//允许的连续次数
	int _maxTimes{};

	void ParseParam(const DBRule& dbRule);


};
