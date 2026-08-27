/**
 * @file RestrictTraineeHoldAssignmentForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _RESTRICTTRAINEEHOLDASSIGNMENTFOREVAFDRULEPARAM_H_
#define _RESTRICTTRAINEEHOLDASSIGNMENTFOREVAFDRULEPARAM_H_

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

class RestrictTraineeHoldAssignmentForEvaFdRule;

class RestrictTraineeHoldAssignmentForEvaFdRuleParam : public RuleParam {
	friend class RestrictTraineeHoldAssignmentForEvaFdRule;
private:
    explicit RestrictTraineeHoldAssignmentForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7248;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 13;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		FOOTPRINT_TYPES = 4,
		FOOTPRINT_SUBTYPES = 5,
		PROGRAM_STATUS = 6,
		PROHIBITED_COURSE_CODES = 7,
		PROHIBITED_ROLES = 8,
		PROHIBITED_ASSIGNMENT_GROUPS = 9,
		PROHIBITED_ASSIGNMENTS = 10,
		TO_FIRST_DUTY_DATE = 11,
		SEVERITY = 12
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};
	
	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};
	
	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};
	
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};
	
	//人员所有计划课程的课程大纲类型。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值，*通配表示忽略该参数。
	//footprint type字典数据来自TM_TRAINING_CONFIG表CATEGORY='FOOTPRINT_TYPE'
	std::string _footprintTypes{};
	SimpleInExMatchExpression _footprintTypesMatch;

	//人员所有计划课程的课程大纲子类型。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值，*通配表示忽略该参数。
	//footprint subtype字典数据来自TM_TRAINING_CONFIG表CATEGORY='FOOTPRINT_SUBTYPE'
	std::string _footprintSubTypes{};
	SimpleInExMatchExpression _footprintSubTypesMatch;

	//人员所有计划课程的状态。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值，*通配表示忽略该参数。
	std::string _programStatus{};
	SimpleInExMatchExpression _programStatusMatch;

	//作为教员时，不能担任该课程(Prohibited Course Codes)的角色(Prohibited Roles)。格式：A|B|C，使用“ | ”分隔多个值
	std::string _prohibitedCourseCodes;
	SimpleInExMatchExpression _prohibitedCourseCodesMatch;

	//教员不能胜任角色。格式：A|B|C，使用“ | ”分隔多个值
	std::string _prohibitedRoles{};
	SimpleInExMatchExpression _prohibitedRolesMatch;

	//禁止执行非训练相关（无course）的任务组（地面任务或Segment Assignment Group）。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值。
	std::string _prohibitedAssignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _prohibitedAssignmentGroupsMatch;

	//禁止执行非训练相关（无course）的任务（地面任务或Segment Assignment）。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值。
	std::string _prohibitedAssignments{};
	AssignmentMatchExpression<Activity> _prohibitedAssignmentsMatch;

	//检查时间是否截止到program first duty date。取值：Y-是，N-否
	bool _toFirstDutyDate{ true };
	
    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

public:

	bool MatchProgramStatus(const std::shared_ptr<CREW>& crew) const;

	//检查能否安排教员X角色的课程
	bool CheckRole(const std::shared_ptr<TmProgramCourseInstructor>& tmProgramCourseInstructor, const time_t limitStartTime, const time_t limitEndTime) const;

	//检查能否安排非培训课程的任务
	bool CheckAssignment(const ROSTER* roster, const time_t limitStartTime, const time_t limitEndTime) const;

};

#endif //_RESTRICTTRAINEEHOLDASSIGNMENTFOREVAFDRULEPARAM_H_
