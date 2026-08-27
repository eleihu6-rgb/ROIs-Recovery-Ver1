/**
 * @file MinRestBasedLocalNightForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _MINRESTBASEDLOCALNIGHTFORPRRULEPARAM_H_
#define _MINRESTBASEDLOCALNIGHTFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CalculateMinRestBasedLocalNightForPRRule;
class CheckMinRestBasedLocalNightForPRRule;

class MinRestBasedLocalNightForPRRuleParam : public RuleParam {
friend class CalculateMinRestBasedLocalNightForPRRule;
friend class CheckMinRestBasedLocalNightForPRRule;
private:
    explicit MinRestBasedLocalNightForPRRuleParam(const Rule* rule):RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7307;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

    enum class ParamLocation {
		PAIRING_BASES = 1,
		ASSIGNMENT_GROUPS,
		ASSIGNMENTS,
		REPORTING_RANGE,
		MIN_REST_AT_BASE,
		MIN_REST_AT_LAYOVER,
		SEVERITY
    };

	//任务环基地。多个值使用“|”分隔并支持*通配
	vector<std::string> _pairingBases{};

	//Duty的签到时间范围，支持*表示忽略该条件。格式：HH:MM-HH:MM，取值范围：[hh:mm,hh:mm)
	std::string _reportingTimeRange{};
	int _reportingTimeRangeMinutesLower{};
	int _reportingTimeRangeMinutesUpper{};
	
	//任务类型(地面任务或者Duty),使用“|”分隔，表示多个值
	std::string _assignments{};
	AssignmentMatchExpression<Activity> _assignmentMatch;

	//任务组类型(地面任务或者Duty),使用“|”分隔，表示多个值
	std::string _assignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _assignmentGroupsMatch;

	//基地的最小休息时间（分钟数）。格式：HH:mm。如果休息时间不满足Local Night定义要求，在基地的最小休息时间
	std::string _minRestAtBase{};
	int _minRestMinutesAtBase{};
	
	//基地的最小休息时间（分钟数）。格式：HH:mm。如果休息时间不满足Local Night定义要求，在外站的最小休息时间
	std::string _minRestAtLayover{};
	int _minRestMinutesAtLayover{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchHomeBase(const Duty& duty, const std::string& base) const;

	bool MatchHomeBase(const ROSTER* roster, const std::string& base) const;

	bool MatchReportingTime(const Duty& duty) const;
private:
	bool MatchParam(const Duty& duty, const std::string& base) const;

	bool MatchParam(const ROSTER* roster, const std::string& base) const;

};

#endif //_MINRESTBASEDLOCALNIGHTFORPRRULEPARAM_H_
