#pragma once
#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class MaxFlightDutyTimeRuleParam;

class MaxFlightDutyTimeRuleParam : public RuleParam {
	friend class CheckMaxFlightDutyTimeRule;
	friend class CalculateMaxFlightDutyTimeRule;
private:
	explicit MaxFlightDutyTimeRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 6107;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 14;

	enum class ParamLocation {
		COMPOSITION = 0,
		RPT_START = 1,
		RPT_END = 2,
		LANDING_LOWER = 3,
		LANDING_UPPER = 4,
		MAX_FDP = 5,
		REST_FACILITY = 6,
		MAX_EXTENSION = 7
	};

	//搭配，支持|分隔
	std::vector<std::string> _compositions{};
	//签到开始时间范围
	std::string _rptStart{};
	std::string _rptEnd{};
	//航段数
	int _landingLower{};
	int _landingUpper{};
	//最大FDP
	int _maxFdp{};
	//最大DP
	int _maxDp{};
	//最大FT
	int _maxFt{};
	string _restFacility{};

	// 发生延误后可延长多少执勤期
	int _maxExtension = 0;


	void ParseParam(const DBRule& dbRule);


};
