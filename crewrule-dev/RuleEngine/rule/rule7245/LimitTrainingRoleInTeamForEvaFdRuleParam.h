/**
 * @file LimitTrainingRoleInTeamForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITTRAININGROLEINTEAMFOREVAFDRULEPARAM_H_
#define _LIMITTRAININGROLEINTEAMFOREVAFDRULEPARAM_H_

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

class LimitTrainingRoleInTeamForEvaFdRule;

class LimitTrainingRoleInTeamForEvaFdRuleParam : public RuleParam {
	friend class LimitTrainingRoleInTeamForEvaFdRule;
private:
    explicit LimitTrainingRoleInTeamForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7245;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		CREW_TEAMS = 4,
		CREW_ROLES = 5,
		SEVERITY = 6
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};
	
	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};
	
	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};
	
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};
	
	//当前组员能否在Teams中。格式：A|B|C，使用“ | ”分隔多个值
	std::string _crewTeam{};
	std::vector<std::string> _crewTeams;

	//课程中当前组员的角色。格式：A|B|C，使用“ | ”分隔多个值
	std::string _crewRole{};
	std::vector<std::string> _crewRoles;
	
    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;




public:

	bool MatchParam(const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor, std::shared_ptr<CREW> crew) const;

	bool CheckParam(const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor) const;
};

#endif //_LIMITTRAININGROLEINTEAMFOREVAFDRULEPARAM_H_
