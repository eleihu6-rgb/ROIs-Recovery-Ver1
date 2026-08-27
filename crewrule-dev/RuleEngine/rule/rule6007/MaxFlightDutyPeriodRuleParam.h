#pragma once
#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class MaxFlightDutyPeriodRuleParam;

class MaxFlightDutyPeriodRuleParam : public RuleParam {
	friend class CheckMaxFlightDutyPeriodRule;
	friend class CalculateMaxFlightDutyPeriodRule;
private:
	explicit MaxFlightDutyPeriodRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 6007;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 8;

	enum class ParamLocation {
		COMPOSITION = 0,
		RPT_START = 1,
		RPT_END = 2,
		LANDING_LOWER = 3,
		LANDING_UPPER = 4,
		MAX_FDP = 5,
		ODP_LOWER = 6,
		ODP_UPPER = 7,
		LANDING_ASSIGNMENTS = 8
	};

	//搭配，支持|分隔
	std::vector<std::string> _compositions{};
	//签到开始时间范围
	std::string _rptStart{};
	std::string _rptEnd{};
	//航段数
	int _landingLower{};
	int _landingUpper{};
	std::vector<std::string> _landingAssignments{};
	//最大FDP
	int _maxFdp{};

	// unkown状态下，前一个duty的ODP时长
	int _odpLower = 0;
	int _odpUpper = 0;

	//Duty层次的标签，支持 * 通配符（任意标签或者无标签）和 | 多个分开设置，为空则代表没有Duyt标签
	std::vector<std::string> _overrideDutyAttributes{};

	//最大FDP 拓展值, 格式hh:mm
	int _maxFdpExtension = 0;
	

	void ParseParam(const DBRule& dbRule);

	bool MatchDutyAttributes(const Duty* duty) const ;
};
