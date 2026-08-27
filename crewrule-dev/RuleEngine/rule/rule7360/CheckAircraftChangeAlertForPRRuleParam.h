/**
 * @file CheckAircraftChangeAlertForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-10
**/

#ifndef _CHECKAIRCRAFTCHANGEALERTFORPRRULEPARAM_H_
#define _CHECKAIRCRAFTCHANGEALERTFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CheckAircraftChangeAlertForPRRule;

class CheckAircraftChangeAlertForPRRuleParam : public RuleParam {
	friend class CheckAircraftChangeAlertForPRRule;
private:
    explicit CheckAircraftChangeAlertForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7360;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 4;

    enum class ParamLocation {
		CURRENT_ASSIGNMENTS = 1,
		NEXT_ASSIGNMENTS,
		CHECK_LEVEL,
		SEVERITY
    };

	//当前航班的Assignments列表,多个值使用“|”分隔并支持*通配
	std::string _currSegmentAssignments{};
	AssignmentMatchExpression<Activity> _currSegmentAssignmentMatch;

	//下个航班的Assignments列表,多个值使用“|”分隔并支持*通配
	std::string _nextSegmentAssignments{};
	AssignmentMatchExpression<Activity> _nextSegmentAssignmentMatch;

	//检查层级,取值：D/P, 其中：D - Duty内部两个连续航班换飞机告警，P - Pairing内部两个衔接航班（可以分属不同Duty的连续航班）  
	std::string _checkLevel{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

public:

	//匹配是否满足参数
	bool MatchParam(const Segment* currSegment, const Segment* nextSegment) const;
};

#endif //_CHECKAIRCRAFTCHANGEALERTFORPRRULEPARAM_H_
