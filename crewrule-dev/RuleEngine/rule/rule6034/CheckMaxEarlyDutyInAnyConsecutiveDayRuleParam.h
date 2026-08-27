#pragma once
#pragma once
#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckMaxEarlyDutyInAnyConsecutiveDayRuleParam;

class CheckMaxEarlyDutyInAnyConsecutiveDayRuleParam : public RuleParam {
	friend class CheckMaxEarlyDutyInAnyConsecutiveDayRule;
private:
	explicit CheckMaxEarlyDutyInAnyConsecutiveDayRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 6034;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 14;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		DUTY_EARIER_THAN = 3,
		MAX_TIMES = 4,
		PEIROD = 5,
		UNIT = 6,
		CHECK_TYPE = 7,
		CHECK_ASSIGNMENTS = 8
	};

	std::vector<string> _bases{};

	std::vector<string> _ranks{};

	std::vector<string> _fleets{};
	//duty开始时间
	int _dutyEarierThan{};
	//允许的连续次数
	int _maxTimes{};
	//周期
	int _period{};
	//单位
	string _unit{};
	//检查类型 P：pairing， D:duty
	string _checkType{};
	//检查的任务类型
	std::vector<std::string> _checkAssignments{};
	//检查的任务类型组
	std::vector<std::string> _checkAssignmentGroups{};

	void ParseParam(const DBRule& dbRule);

	bool CheckAssignmentGroup(const string assignment) const;

	bool CheckAssignment(const string assignment) const;

public:

	bool MatchAssignment(const string assignment) const ;

};
