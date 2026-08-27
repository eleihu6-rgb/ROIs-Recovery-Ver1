/**
 * @file LimitCourseRoleQualForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITCOURSEROLEQUALFOREVAFDRULEPARAM_H_
#define _LIMITCOURSEROLEQUALFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class LimitCourseRoleQualForEvaFdRule;

class LimitCourseRoleQualForEvaFdRuleParam : public RuleParam {
	friend class LimitCourseRoleQualForEvaFdRule;
private:
    explicit LimitCourseRoleQualForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7234;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 1;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		TYPE = 4,
		SEVERITY = 5
    };

	//人员所属基地,使用“|”分隔，表示多个值
	std::vector<std::string> _bases{};
	//人员级别,使用“|”分隔，表示多个值
	std::vector<std::string> _ranks{};
	//人员机型,使用“|”分隔，表示多个值
	std::vector<std::string> _fleets{};
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//检查类型，取值：TRAINING
	std::string _type;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

public:

	bool MatchParam(const ROSTER& roster) const;

};

#endif //_LIMITCOURSEROLEQUALFOREVAFDRULEPARAM_H_
