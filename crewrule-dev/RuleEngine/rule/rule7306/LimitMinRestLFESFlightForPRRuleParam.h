/**
 * @file LimitMinRestLFESFlightForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LimitMinRestLFESFlightFORPRRULEPARAM_H_
#define _LimitMinRestLFESFlightFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class LimitMinRestLFESFlightForPRRule;

class LimitMinRestLFESFlightForPRRuleParam : public RuleParam {
	friend class LimitMinRestLFESFlightForPRRule;
private:
    explicit LimitMinRestLFESFlightForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7306;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

    enum class ParamLocation {
		BASES = 1,
		RANKS,
		FLEETS,
		TEAMS,
		DUTY_ASSIGNMENT_GROUPS,
		DUTY_ASSIGNMENTS,
		DUTY_TIME_RANGES,
		ATTRIBUTES,
		IS_TURNAROUND,
		MAX_CONSECUTIVE_TIMES,
		SEVERITY
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};

	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};

	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};

	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//Duty的任务类型组,多个值使用“|”分隔并支持*通配
	AssignmentGroupMatchExpression<Activity> _dutyAssignmentGroupsMatch;

	//Duty的任务类型,多个值使用“|”分隔并支持*通配
	AssignmentMatchExpression<Activity> _dutyAssignmentsMatch;

	//从Duty的签到到签出时间范围。格式：HH:mm-HH:mm取值范围:[HH:mm,HH:mm)
	std::string _dutyTimeRanges{};
	int _dutyTimeHHmmLower{};
	int _dutyTimeHHmmUpper{};

	//满足条件Pairing标签列表。多个值使用“|”分隔并支持*通配
	vector<std::string> _pairingAttributes{};

	//是否是Turnaround任务环。取值：Y/N或者空/*，N - 包括Layover任务环，Y-只有一个Duty的任务环(即Turnaround任务环)，空和* - 任意任务环
	shared_ptr<bool> _isTurnaround{ nullptr };

	//满足时间范围dutyTimeRanges的Duty最大连续次数上限。
	int _maxConsecutiveTimes{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchDutyTimeRanges(const Duty* duty) const;

	bool MatchPairingAttributes(const Pairing* pairing) const;

	bool MatchTurnaround(const Pairing* pairing) const;

public:
	//匹配参数
	bool MatchParam(const Duty* duty, const Pairing* pairing) const;
};

#endif //_LimitMinRestLFESFlightFORPRRULEPARAM_H_
