/**
 * @file CheckMinNumberOfDaysOffBasicForPRRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-11-03
**/

#ifndef _CHECKMINNUMBEROFDAYSOFFBASICFORPRRULEPARAM_H_
#define _CHECKMINNUMBEROFDAYSOFFBASICFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CheckMinNumberOfDaysOffForPRRule;
class CheckMinNumberOfDaysOffForPRRuleParam;

class CheckMinNumberOfDaysOffBasicForPRRuleParam : public RuleParam {
	friend class CheckMinNumberOfDaysOffForPRRule;
	friend class CheckMinNumberOfDaysOffForPRRuleParam;
private:
    explicit CheckMinNumberOfDaysOffBasicForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7325;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 15;

    enum class ParamLocation {
		BASES = 1,
		RANKS = 2,
		FLEETS = 3,
		TEAMS = 4,
		EXCLUDE_TEAMS = 5,
		LEAVE_ASSIGNMENT_GROUPS = 6,
		LEAVE_ASSIGNMENTS = 7,
		DAYS_OFF_ASSIGNMENT_GROUPS = 8,
		DAYS_OFF_ASSIGNMENTS = 9,
		LATEST_DEBRIEF_BREFORE_FIRST_DO = 10,
		EARLIEST_BRIEF_AFTER_LAST_DO = 11,
		INCLUDE_BLANK_DAYS = 12,
		DAYS_IN_MONTH  = 13,
		MAX_CONSECUTIVE_WORKING_DAYS_BTW_DO = 14,
		SPACING = 15,
		COVERED_WEEKENDS = 16,
		SEVERITY = 17
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};

	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};

	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};

	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//除外团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _excludeTeams{};

	//Leave的Assignment Groups列表。多个值使用“|”分隔并支持*通配
	std::vector<string> _leaveAssignmentGroups{};
	AssignmentMatchExpression<Activity> _leaveAssignmentGroupsMatch;

	//Leave的Assignments列表。多个值使用“|”分隔并支持*通配
	std::vector<string> _leaveAssignments{};
	AssignmentMatchExpression<Activity> _leaveAssignmentsMatch;

	//Days Off的Assignment Groups列表。多个值使用“|”分隔并支持*通配
	std::vector<string> _daysOffAssignmentGroups{};
	AssignmentMatchExpression<Activity> _daysOffAssignmentGroupsMatch;

	//Days Off的Assignments列表。多个值使用“|”分隔并支持*通配
	std::vector<string> _daysOffAssignments{};
	AssignmentMatchExpression<Activity> _daysOffAssignmentsMatch;
	
	//连续DO前一天的工作任务必须在该时间之前结束。格式：HH:mm
	std::string _latestDebriefBeforeFirstDOHHmm{};
	int _latestDebriefBeforeFirstDOHHmmMinutes{0};
	
	//连续DO后一天的工作任务必须在该时间之后开始。格式：HH:mm
	std::string _earliestBriefAfterLastDOHHmm{};
	int _earliestBriefAfterLastDOHHmmMinutes;

	//空白天是否算DO, Y/N/*, *号默认为Y
	bool _includeBlankDays = true;

	//检查所在月份的全部天数。如果检查区间月份日历天数不满足该条件，忽略该Rule。
	std::string _daysInMonth{};
	int _daysInMonthInt{};

	//最大的连续工作天数
	int _maxConsecutiveWorkingDays{};

	//连续DO和另外一个连续DO之间至少间隔天数。* 为没有限制 
	std::string _spacingStr{};
	int _spacing{};

	//在日历月内覆盖一次完整周六周日。支持* 设置，即无需求。
	bool _coverdWeekends = false;

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

public:
	//activity为Pairing、Duty或Segment对象
	bool MatchLeaveAssignment(const Activity* activity) const;

	bool MatchDoAssignment(const Activity* activity) const;

	bool MatchDays(const int day) const;

};

#endif //_CHECKMINNUMBEROFDAYSOFFBASICFORPRRULEPARAM_H_
