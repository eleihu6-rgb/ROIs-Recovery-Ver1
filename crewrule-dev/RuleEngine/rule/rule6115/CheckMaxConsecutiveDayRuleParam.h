#pragma once
#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckMaxConsecutiveDayRuleParam;

class CheckMaxConsecutiveDayRuleParam : public RuleParam {
	friend class CheckMaxConsecutiveDayRule;
private:
	explicit CheckMaxConsecutiveDayRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 6115;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 14;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		DUTY_ASSIGNMENT = 3,
		MAX_CONSECUTIVE_TIME = 4,
		ADD_MAX_CONSECUTIVE_TIME = 5,
		ADD_MAX_NUMBER = 6,
		UNIT = 7,

	};

	//所属基地,使用“|”分隔，表示多个值
	std::vector<std::string> _bases{};
	//人员级别,使用“|”分隔，表示多个值
	std::vector<std::string> _ranks{};
	//人员机型,使用“|”分隔，表示多个值
	std::vector<std::string> _fleets{};
	//任务类型,使用“|”分隔，表示多个值
	std::vector<std::string> _dutyAssignments{};
	//最大连续天数(跨RP)
	int _maxConsecutiveTime{};
	//最大连续天数(RP内)
	int _maxConsecutiveDayInRP{};
	//额外的最大连续天数是否在RP内 Y（额外次数必须在RP内）、N（额外次数跨RP）、*（额外次数在RP内或跨RP）
	std::string _isAddMaxInRP{};
	//额外的最大连续天数 6天
	int _addMaxConsecutiveTime{};
	//额外的次数 1次
	int _addMaxNumber{};
	//周期单位
	string _unit{};


	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;
};
