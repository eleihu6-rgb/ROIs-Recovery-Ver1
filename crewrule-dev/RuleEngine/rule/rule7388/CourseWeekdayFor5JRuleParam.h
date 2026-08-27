/**
 * @file CourseWeekdayFor5JRuleParam.h
 * @brief 7388法规参数类 - Course只能安排在指定weekday
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-07
**/

#ifndef _COURSEWEEKDAYFOR5JRULEPARAM_H_
#define _COURSEWEEKDAYFOR5JRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class LimitCourseWeekdayFor5JRule;

class CourseWeekdayFor5JRuleParam : public RuleParam {
	friend class LimitCourseWeekdayFor5JRule;
private:
    explicit CourseWeekdayFor5JRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7388;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 6;

    enum class ParamLocation {
		BASES = 0,
		RANKS,
		FLEETS,
		TEAMS,
		TYPE
    };

	//人员所属基地,使用"|"分隔，表示多个值
	std::vector<std::string> _bases{};
	//人员级别,使用"|"分隔，表示多个值
	std::vector<std::string> _ranks{};
	//人员机型,使用"|"分隔，表示多个值
	std::vector<std::string> _fleets{};
	//团队,多个值使用"|"分隔并支持*通配
	std::vector<std::string> _teams{};

	//检查类型，取值：TRAINING
	std::string _type;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchParam(const ROSTER& roster) const;

	int CheckParam(const ROSTER& roster) const;

};

#endif //_COURSEWEEKDAYFOR5JRULEPARAM_H_