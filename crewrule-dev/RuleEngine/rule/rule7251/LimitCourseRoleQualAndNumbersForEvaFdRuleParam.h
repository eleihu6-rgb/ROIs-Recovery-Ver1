/**
 * @file LimitCourseRoleQualAndNumbersForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITCOURSEROLEQUALANDNUMBERSFOREVAFDRULEPARAM_H_
#define _LIMITCOURSEROLEQUALANDNUMBERSFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class LimitCourseRoleQualAndNumbersForEvaFdRule;

class LimitCourseRoleQualAndNumbersForEvaFdRuleParam : public RuleParam {
	friend class LimitCourseRoleQualAndNumbersForEvaFdRule;
private:
    explicit LimitCourseRoleQualAndNumbersForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7251;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		TYPE = 4,
		PNR_EXCEPTION_CODE = 5,
		SEVERITY = 6
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

	//PNR异常代码,Segment设置异常代码则不检查PNR相关资质和人员数量。多个值使用“|”分隔并支持*通配
	std::set<std::string> _pnrExceptionCodes{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

public:

	bool MatchParam(const ROSTER& roster) const;

};

#endif //_LIMITCOURSEROLEQUALANDNUMBERSFOREVAFDRULEPARAM_H_
