/**
 * @file GroundRosterWorkingHourForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _GROUNDROSTERWORKINGHOURFOREVAFDRULEPARAM_H_
#define _GROUNDROSTERWORKINGHOURFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "RuleParams.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "matcher/TrainingCourseCodeMatchExpression.h"
#include "matcher/TrainingRoleMatchExpression.h"
#include "matcher/IPOrCKQualMatchExpression.h"
#include "matcher/TrainingChiefPilotRankMatchExpression.h"
#include "matcher/BoolMatchExpression.h"

#include <string>
#include <limits>

class CalculateWorkingHourInMandayForEvaFdRule;
class WorkingHourForEvaFdRuleParam;

class GroundRosterWorkingHourForEvaFdRuleParam : public RuleParam {
	friend class CalculateWorkingHourInMandayForEvaFdRule;
	friend class WorkingHourForEvaFdRuleParam;
private:
    explicit GroundRosterWorkingHourForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7219;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

    enum class ParamLocation {
		ROSTER_ASSIGNMENT_GROUPS = 0,
		ROSTER_ASSIGNMENTS = 1,
		FOLLOWING_PAIRING = 2,
		COURSE_CODE = 3,
		WORKING_HOUR = 4,
		SPLIT_METHOD = 5,
		SEVERITY = 6
    };

	//Roster的任务组。多个值使用“|”分隔并支持*通配
	std::string _rosterAssignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _rosterAssignmentGroupsMatch;

	//Roster的任务类型。多个值使用“|”分隔并支持*通配
	std::string _rosterAssignments{};
	AssignmentMatchExpression<Activity> _rosterAssignmentsMatch;

	//是否紧接Pairing(包含重叠)。格式：Y/N，*通配表示忽略该参数。当前Pairing后面是否紧接Pairing(包含重叠)
	std::string _isFollowingPairing{};
	BoolMatchExpression _isFollowingPairingMatch;

	//课程编号,格式：A|B|C 或者 !(A|B|C) 或 *。使用“|”分隔多个值。*通配表示忽略该参数
	std::string _courseCodes{};
	TrainingCourseCodeMatchExpression<Activity> _courseCodeMatch;

	//工作时间计算表达式。公式或者具体时长（格式HH:mm）,支持公式如下：BT：飞时
	std::string _whExpression{};
	std::shared_ptr<int> _whExpressionMinutes{ nullptr };

	////跨天分隔时长方式。取值：SPAN -按实际的时间跨度进行切分，AVG - 按平均切割
	//string _splitMethod{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断是否紧接或重叠
	bool MatchFollowingPairing(const ROSTER* currRoster, const ROSTER* nextRoster) const;
public:

	//匹配参数
	bool MatchParam(const ROSTER* currRoster, const ROSTER* nextRoster) const;

};

#endif //_GROUNDROSTERWORKINGHOURFOREVAFDRULEPARAM_H_
