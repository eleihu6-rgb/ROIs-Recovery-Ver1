/**
 * @file LimitSameRoleInstructorOnExtraCourseForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITSAMEROLEINSTRUCTORONEXTRACOURSEFOREVAFDRULEPARAM_H_
#define _LIMITSAMEROLEINSTRUCTORONEXTRACOURSEFOREVAFDRULEPARAM_H_

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

class LimitSameRoleInstructorOnExtraCourseForEvaFdRule;

class LimitSameRoleInstructorOnExtraCourseForEvaFdRuleParam : public RuleParam {
	friend class LimitSameRoleInstructorOnExtraCourseForEvaFdRule;
private:
    explicit LimitSameRoleInstructorOnExtraCourseForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7258;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		COURSE_CODES = 4,
		TRAINING_ROLES = 5,
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

	//训练课程代码。格式：A|B|C ，使用“|”分隔多个值。
	vector<std::string> _courseCodes{};

	//训练角色。格式：A|B|C, 多个值使用“|”分隔并支持*通配
	std::string _strTrainingRoles{};
	vector<std::string> _trainingRoles{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;
public:

	bool MatchCourse(const std::shared_ptr<TmCourse>& tmCourse) const;
};

#endif //_LIMITSAMEROLEINSTRUCTORONEXTRACOURSEFOREVAFDRULEPARAM_H_
