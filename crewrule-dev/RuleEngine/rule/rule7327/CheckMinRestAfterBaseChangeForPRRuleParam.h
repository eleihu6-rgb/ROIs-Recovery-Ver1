/**
 * @file CheckMinRestAfterBaseChangeForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-27
**/

#ifndef _CHECKMINRESTAFTERBASECHANGEFORPRRULEPARAM_H_
#define _CHECKMINRESTAFTERBASECHANGEFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CheckMinRestAfterBaseChangeForPRRule;

class CheckMinRestAfterBaseChangeForPRRuleParam : public RuleParam {
	friend class CheckMinRestAfterBaseChangeForPRRule;
private:
    explicit CheckMinRestAfterBaseChangeForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7327;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 9;

    enum class ParamLocation {
		BASES = 1,
		RANKS = 2,
		FLEETS = 3,
		TEAMS = 4,
		WORKING_ASSIGNMENT_GROUPS = 5,
		MIN_REST = 6,
		REST_TYPE = 7,
		INCLUDING_LOCAL_NIGHTS = 8,
		SEVERITY = 9
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

	//最小休息时间，即最小休息小时数、或者最小完整休息日历日
	int _minRest{};

	//休息时间类型。取值：RH - 小时数，CD - 日历日
	string _restType{};

	//当前Roster的Pairing标签列表。多个值使用“|”分隔并支持*通配
	string _strIncludingLocalNights;
	int _includingLocalNightsNum{};

	//当前Roster的Assignment列表。多个值使用“|”分隔并支持*通配。当前Roster可能是飞行任务或地面任务
	vector<string> _assignments{};

	//前面Roster的Assignment列表。多个值使用“|”分隔并支持*通配。
	vector<string> _beforeAssignments{};

	//后面Roster的Assignment列表。多个值使用“|”分隔并支持*通配。
	vector<string> _afterAssignments{};

	//符合Attributes参数定义Roster之后，第二天最早签到时间。格式：HH:mm
	std::string _earliestBriefAfterRoster{};
    int _earliestBriefAfterRosterMinutes{};

	//符合Attributes参数定义Roster之前，前一天最晚签出时间。格式：HH:mm
	std::string _latestDebriefBeforeRoster{};
    int _latestDebriefBeforeRosterMinutes{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

public:
	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchWorkingAssignmentGroup(const Activity* activity) const;

};

#endif //_CHECKMINRESTAFTERBASECHANGEFORPRRULEPARAM_H_
