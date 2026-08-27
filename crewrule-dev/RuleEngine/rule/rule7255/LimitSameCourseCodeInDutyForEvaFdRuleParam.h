/**
 * @file LimitSameCourseCodeInDutyForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITSAMECOURSECODEINDUTYFOREVAFDRULEPARAM_H_
#define _LIMITSAMECOURSECODEINDUTYFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/InExMatchExpression.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "matcher/BoolMatchExpression.h"

class LimitSameCourseCodeInDutyForEvaFdRule;

class LimitSameCourseCodeInDutyForEvaFdRuleParam : public RuleParam {
	friend class LimitSameCourseCodeInDutyForEvaFdRule;
private:
    explicit LimitSameCourseCodeInDutyForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7255;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 6;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		FOOTPRINT_TYPES = 4,
		FOOTPRINT_SUB_TYPES = 5,
		COURSE_TYPE = 6,
		SEVERITY = 7
	};

	//人员所属基地,使用“|”分隔，表示多个值
	std::vector<std::string> _bases{};
	//人员级别,使用“|”分隔，表示多个值
	std::vector<std::string> _ranks{};
	//人员机型,使用“|”分隔，表示多个值
	std::vector<std::string> _fleets{};
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//人员所有计划课程的课程大纲类型(前提满足“Program Status”	的Program。)，格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值
	//footprint type字典数据来自TM_TRAINING_CONFIG表CATEGORY='FOOTPRINT_TYPE'
	std::string _footprintTypes;
	SimpleInExMatchExpression _footprintTypeMatch;

	//人员所有计划课程的课程大纲类型。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值，*通配表示忽略该参数。
	//footprint subtype字典数据来自TM_TRAINING_CONFIG表CATEGORY='FOOTPRINT_TYPE'的子节点
	std::string _footprintSubtypes{};
	SimpleInExMatchExpression _footprintSubtypesMatch;

	//课程类型。取值：LINE、GROUND、SIM
	std::string _courseType{};
	SimpleInExMatchExpression _courseTypeMatch;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchFootprintType(const std::shared_ptr<TmProgram>& tmProgram) const;
public:
	bool MatchParam(const std::shared_ptr<TmProgram>& tmProgram, const long long courseId) const;
};

#endif //_LIMITSAMECOURSECODEINDUTYFOREVAFDRULEPARAM_H_
