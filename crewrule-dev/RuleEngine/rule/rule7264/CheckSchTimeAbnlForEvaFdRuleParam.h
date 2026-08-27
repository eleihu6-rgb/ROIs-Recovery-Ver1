/**
 * @file CheckSchTimeAbnlForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKSCHTIMEABNLFOREVAFDRULEPARAM_H_
#define _CHECKSCHTIMEABNLFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentMatchExpression.h"
#include "matcher/InExMatchExpression.h"

class CheckSchTimeAbnlForEvaFdRule;

class CheckSchTimeAbnlForEvaFdRuleParam : public RuleParam {
	friend class CheckSchTimeAbnlForEvaFdRule;
private:
    explicit CheckSchTimeAbnlForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7264;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 5;

    enum class ParamLocation {
		DUTY_ASSIGNMENTS = 0,
		FLIGHT_FLEET_IN_DUTY = 1,
		TIME_TYPE = 2,
		SEVERITY = 4
    };

	//Duty的任务类型,多个值使用“|”分隔并支持*通配
	std::string _dutyAssignments{};
	AssignmentMatchExpression<Activity> _dutyAssignmentsMatch;

	//Duty中包含航班机型（只要任意航段满足即可）,多个值使用“|”分隔并支持*通配
	std::string _flightFleetInDuty{};
	SimpleInExMatchExpression _flightFleetInDutyMatch;

	//检查时间类型,取值：SCH-计划时间,ACT-实际时间
	std::string _timeType{"SCH"};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchFlightFleetInDuty(const Duty& duty) const;
public:

	//匹配是否满足参数
	bool MatchParam(const Duty& duty) const;

};

#endif //_CHECKSCHTIMEABNLFOREVAFDRULEPARAM_H_
