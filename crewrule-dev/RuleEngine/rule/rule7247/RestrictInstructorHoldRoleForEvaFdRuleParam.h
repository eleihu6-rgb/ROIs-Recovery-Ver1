/**
 * @file RestrictInstructorHoldRoleForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _RESTRICTINSTRUCTORHOLDROLEFOREVAFDRULEPARAM_H_
#define _RESTRICTINSTRUCTORHOLDROLEFOREVAFDRULEPARAM_H_

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

class RestrictInstructorHoldRoleForEvaFdRule;

class RestrictInstructorHoldRoleForEvaFdRuleParam : public RuleParam {
	friend class RestrictInstructorHoldRoleForEvaFdRule;
private:
    explicit RestrictInstructorHoldRoleForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7247;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 8;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		CREW_QUALIFICATIONS = 4,
		RECURRENT_TRAINING_COURSE_CODES = 5,
		PROHIBITED_ROLES = 6,
		SEVERITY = 7
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};
	
	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};
	
	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};
	
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};
	
	//教员资质。格式：A|B|C，使用“|”分隔多个值，*通配表示忽略该参数。
	std::string _crewQual{};
	std::vector<std::string> _crewQuals{};

	//教员作为学员参加的复训课程。格式：A|B|C 或 *，使用“|”分隔多个值。
	std::string _recurrentTrainingCourseCodes{};
	SimpleInExMatchExpression _recurrentTrainingCourseCodesMatch;

	//教员不能胜任角色。格式：A|B|C，使用“ | ”分隔多个值
	std::string _prohibitedRoles{};
	SimpleInExMatchExpression _prohibitedRolesMatch;
	
    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

};

#endif //_RESTRICTINSTRUCTORHOLDROLEFOREVAFDRULEPARAM_H_
