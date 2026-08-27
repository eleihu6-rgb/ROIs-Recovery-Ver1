/**
 * @file CheckBirthdayDaysOffForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-03
**/

#ifndef _CHECKBIRTHDAYDAYSOFFFORPRRULEPARAM_H_
#define _CHECKBIRTHDAYDAYSOFFFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CheckBirthdayDaysOffForPRRule;

class CheckBirthdayDaysOffForPRRuleParam : public RuleParam {
	friend class CheckBirthdayDaysOffForPRRule;
private:
    explicit CheckBirthdayDaysOffForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7324;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 11;

    enum class ParamLocation {
		BASES = 1,
		RANKS,
		FLEETS,
		TEAMS,
		BIRTHDAY_ASSIGNMENTS,
		BEFORE_AFTER_BIRTHDAY_ASSIGNMENTS,
		DAYS_OFF_BEFORE_BIRTHDAY,
		DAYS_OFF_AFTER_BIRTHDAY,
		LATEST_END_TIME,
		EARLIEST_START_TIME,
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

	//Days Off的Assignments列表。多个值使用“|”分隔并支持*通配
	std::vector<string> _birthdayAssignments{};
	AssignmentMatchExpression<Activity> _birthdayAssignmentsMatch;

	//Days Off的Before/After Assignments列表。多个值使用“|”分隔并支持*通配
	std::vector<string> _beforeAndAfterBirthdayAssignments{};
	AssignmentMatchExpression<Activity> _beforeAndAfterBirthdayAssignmentsMatch;
	
	//生日当天之前，需要分配X个DO。用Birthday Assignments定义代码
	int _daysOffBeforeBirthday{};
	
	//生日当天之后，需要分配Y个DO。用Birthday Assignments定义代码
	int _daysOffAfterBirthday{};
	
	//生日前一天的工作任务必须在该时间之前结束。格式：HH:mm
	std::string _latestEndTimeHHmm{};
	int _latestEndTimeHHmmMinutes;
	
	//生日后一天的工作任务必须在该时间之后开始。格式：HH:mm
	std::string _earliestStartTimeHHmm{};
	int _earliestStartTimeHHmmMinutes;

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

public:
	//activity为Pairing、Duty或Segment对象
	bool MatchBirthdayAssignment(const Activity* activity) const;

	//activity为Pairing、Duty或Segment对象
	bool MatchBeforeAndAfterBirthdayAssignment(const Activity* activity) const;
};

#endif //_CHECKBIRTHDAYDAYSOFFFORPRRULEPARAM_H_
