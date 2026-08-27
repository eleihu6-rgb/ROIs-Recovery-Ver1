/**
 * @file CheckMaxConsecutiveDutyRuleParamForIt.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKMAXCONSECUTIVEDUTYRULEPARAMFORIT_H_
#define _CHECKMAXCONSECUTIVEDUTYRULEPARAMFORIT_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckMaxConsecutiveDutyRuleForIt;

class CheckMaxConsecutiveDutyRuleParamForIt : public RuleParam {
	friend class CheckMaxConsecutiveDutyRuleForIt;
private:
	explicit CheckMaxConsecutiveDutyRuleParamForIt(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7115;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 9;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		DUTY_ASSIGNMENTS = 3,
		CONSECUTIVE_DAYS = 4,
		NEXT_DAY_EXTENSION = 5,
		NOT_ALLOWED_ATTRIBUTES = 6,
		NOT_ALLOWED_ASSIGNMENTS = 7,
		NOT_ALLOWED_DAYS = 8
	};

	//所属基地,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _bases{};
	//人员级别,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _ranks{};
	//人员机型,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _fleets{};
	//任务类型,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _dutyAssignments{};
	//连续天数
	int _consecutiveDays{};
	//定义几点以后认为和下一天连续，例如：第一天22:00落地，第二天空白，认为和第二天连续
	int _nextDayExtension{};
	//不允许的标签 支持 *，| 多个标签代码
	std::vector<std::string> _notAllowedAttributes{};
	//不允许的任务类型，支持 *，| 多个标签代码
	std::vector<std::string> _notAllowedAssignments{};
	//不允许在第几天，支持 | 分割多个天，例如：3|4
	std::vector<int> _notAllowedDays{};


	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& CheckedStartTime, const time_t& CheckedEndTime) const;

	//判断Duty是否满足任务类型（计算BLH的任务类型）
	bool MatchAssignments(const Duty& duty, const std::shared_ptr<CrewDataContext>& dbData) const;

};

#endif //_CHECKMAXCONSECUTIVEDUTYRULEPARAMFORIT_H_
