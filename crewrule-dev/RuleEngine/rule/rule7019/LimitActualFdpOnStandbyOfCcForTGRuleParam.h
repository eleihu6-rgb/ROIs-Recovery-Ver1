/**
 * @file LimitActualFdpOnStandbyOfCcForTGRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITACTUALFDPONSTANDBYOFCCFORTGRULEPARAM_H_
#define _LIMITACTUALFDPONSTANDBYOFCCFORTGRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include <string>
#include <limits>

class LimitActualFdpOnStandbyOfCcForTGRule;

class LimitActualFdpOnStandbyOfCcForTGRuleParam : public RuleParam {
friend class LimitActualFdpOnStandbyOfCcForTGRule;
private:
    explicit LimitActualFdpOnStandbyOfCcForTGRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7019;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 5;

    enum class ParamLocation {
		IS_HOME_BASE = 1,
		STANDBY_ASSIGNMENT_GROUPS = 2,
		STANDBY_ASSIGNMENTS = 3,
		MAX_COMBINED_DURATION = 4,
		SEVERITY = 5
    };

	//是否在基地,取值：Y/N。*表示未设置
	std::unique_ptr<bool> _isHomeBase{ nullptr };

	//Standby的任务类型组,多个值使用“|”分隔并支持*通配
	std::string _standbyAssignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _standbyAssignmentGroupsMatch;

	//Standby的任务类型,多个值使用“|”分隔并支持*通配
	std::string _standbyAssignments{};
	AssignmentMatchExpression<Activity> _standbyAssignmentsMatch;

	//最大组合持续时间。格式：HH:mm。即：“standby抓飞时长”和”随后的duty的实际FDP”的合计时长
	std::string _maxCombinedDuration{};
	int _maxCombinedDurationMinutes{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//匹配是否满足在基地条件
	bool MatchHomeBase(const Duty& duty, const std::string& base) const;

public:

	bool MatchParam(const ROSTER* standbyRoster, const Duty& duty, const string& base) const;

};

#endif //_LIMITACTUALFDPONSTANDBYOFCCFORTGRULEPARAM_H_
