/**
 * @file LimitProgramCourseRoleForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITPROGRAMCOURSEROLEFOREVAFDRULEPARAM_H_
#define _LIMITPROGRAMCOURSEROLEFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/InExMatchExpression.h"
#include "matcher/TrainingCourseCodeMatchExpression.h"
#include "matcher/TrainingRoleMatchExpression.h"

class LimitProgramCourseRoleForEvaFdRule;

class LimitProgramCourseRoleForEvaFdRuleParam : public RuleParam {
	friend class LimitProgramCourseRoleForEvaFdRule;
private:
    explicit LimitProgramCourseRoleForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7230;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 9;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		COURSE_CODES = 4,
		PROGRAM_STATUSES = 5,
		FOOTPRINT_TYPES = 6,
		ROLES = 7,
		SEVERITY = 8
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};
	
	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};
	
	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};
	
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};
	
	//当前排课的培训课程代码，格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值
	std::string _courseCodes;
	SimpleInExMatchExpression _courseCodeMatch;

	//人员所有计划课程的状态，格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值
	//program状态取值："Not Scheduled"、"Partially Scheduled"、"Scheduled"、"Completed"、"Manual End"
	std::string _programStatuses;
	SimpleInExMatchExpression _programStatusMatch;

	//人员所有计划课程的课程大纲类型(前提满足“Program Status”	的Program。)，格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值
	//footprint type字典数据来自TM_TRAINING_CONFIG表CATEGORY='FOOTPRINT_TYPE'
	std::string _footprintTypes;
	SimpleInExMatchExpression _footprintTypeMatch;

	//当前排课的角色，格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值
	std::string _roles;
	SimpleInExMatchExpression _roleMatch;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	//匹配机组人员所有的培训计划的状态
	bool MatchProgramStatusAndFootprintType(const ROSTER& roster) const;
	bool MatchProgramStatusAndFootprintType(const std::shared_ptr<TmProgramCourse>& teProgramCourse) const;

public:

	bool MatchParam(const ROSTER& roster, const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor) const;

	bool CheckParam(const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor) const;
};

#endif //_LIMITPROGRAMCOURSEROLEFOREVAFDRULEPARAM_H_
