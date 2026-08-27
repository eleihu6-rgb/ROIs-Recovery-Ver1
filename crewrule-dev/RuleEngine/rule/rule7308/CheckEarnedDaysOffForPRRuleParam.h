/**
 * @file CheckEarnedDaysOffForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-08-21
**/

#ifndef _CHECKEARNEDDAYSOFFFORPRRULEPARAM_H_
#define _CHECKEARNEDDAYSOFFFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CheckEarnedDaysOffForPRRule;

class CheckEarnedDaysOffForPRRuleParam : public RuleParam {
	friend class CheckEarnedDaysOffForPRRule;
private:
    explicit CheckEarnedDaysOffForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7308;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 14;

    enum class ParamLocation {
		BASES = 1,
		RANKS = 2,
		FLEETS = 3,
		TEAMS = 4,
		WORKING_ASSIGNMENT_GROUPS = 5,
		WORKING_ASSIGNMENTS = 6,
		WORKING_LEVEL = 7,
		DO_ASSIGNMENT_GROUPS = 8,
		DO_ASSIGNMENTS = 9,
		BLANK_DAY_COUNTED_AS_DO = 10,
		CONSECUTIVE_WORKING_DAYS = 11,
		FIXED_REQUIRED_DO = 12,
		PERCENT_REQUIRED_DO = 13,
		SEVERITY = 14
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};

	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};

	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};

	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//工作任务类型组。多个值使用“|”分隔并支持*通配
	std::vector<string> _workingAssignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _workingAssignmentGroupsMatch;

	//工作任务类型。多个值使用“|”分隔并支持*通配
	std::vector<string> _workingAssignments{};
	AssignmentMatchExpression<Activity> _workingAssignmentsMatch;

	//连续工作日层级。取值：P、D或S，分别代表Pairing、Duty和Flight。
	std::string _workingLevel{};

	//Days off任务类型组。多个值使用“|”分隔并支持*通配
	std::vector<string> _doAssignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _doAssignmentGroupsMatch;

	//Days off任务类型。多个值使用“|”分隔并支持*通配
	std::vector<string> _doAssignments{};
	AssignmentMatchExpression<Activity> _doAssignmentsMatch;

	//空白天能否作为Days off。取值：Y/N。Y-空白天作为Days off。N-空白天不作为Days off。
	bool _isBlankDayCountedAsDO{};

	//连续工作天数范围。格式：n-m，表示[n,m)
	std::string _consecutiveWorkingDays{};
	int _consecutiveWorkingDaysLower{};
	int _consecutiveWorkingDaysUpper{};

	//连续工作天后休息的Days off天数（天数）。支持*表示忽略该参数。检查天数从连续工作天结束时间的第二天开始计算。支持0.5天（00:00 -12:00）
	shared_ptr<double> _fixedRequiredDO{nullptr};

	//连续工作天后休息的Days off天数百分比（百分比）。支持*表示忽略该参数，与“Fixed Required DO”二选一。例如：配置50.5表示50.5%。需要休息的DO小时数=ceil([实际连续工作天数]*[DO%]*24) 向上取整。
	shared_ptr<double> _percentRequiredDO{ nullptr };

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

public:
	//activity为Pairing、Duty或Segment对象
	bool MatchWorkingAssignmentGroupAndAssignment(const Activity* activity) const;

	//activity为Pairing、Duty或Segment对象
	bool MatchDOAssignmentGroupAndAssignment(const Activity* activity) const;
	
	//activity为Pairing、Duty或Segment对象
	bool MatchConsecutiveWorkingDays(const int consecutiveWorkingDays) const;

};

#endif //_CHECKEARNEDDAYSOFFFORPRRULEPARAM_H_
