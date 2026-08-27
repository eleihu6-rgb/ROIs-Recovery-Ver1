#pragma once
#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckMaxConsecutiveWOCLDutyRuleParam;

class CheckMaxConsecutiveWOCLDutyRuleParam : public RuleParam {
	friend class CheckMaxConsecutiveWOCLDutyRule;
private:
	explicit CheckMaxConsecutiveWOCLDutyRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 6032;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 14;

	enum class ParamLocation {
		WOCL_START = 0,
		WOCL_END = 1,
		ALLOWED_CONSECUTIVE_TIMES = 2,
		FIRST_MAX_CONSECUTIVE_TIMES = 3,
		FIRST_REDUCE_FDP_TIME = 4,
		SECOND_MAX_CONSECUTIVE_TIMES = 5,
		SECOND_REDUCE_FDP_TIME = 6,
		NOT_EARLIER_THAN = 7
	};

	//wocl开始时间范围,12:00 -> 720
	int _woclStart{};
	int _woclEnd{};
	//允许的连续次数
	int _allowedConsecutiveTimes{};
	//第一个允许超过的连续次数
	int _firstMaxConsecutiveTimes{};
	//需满足的条件
	int _firstReduceFDPTime{};
	//第二个允许超过的连续次数
	int _secondMaxConsecutiveTimes{};
	//需满足的条件
	int _secondReduceFDPTimes{};
	// 需要的当地夜晚
	int _needLocalNightNum{};

	// first和second不能早于
	int _notEarlierThan{};


	void ParseParam(const DBRule& dbRule);


};
