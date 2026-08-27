/**
 * @file CheckAssignmentOverlappableRuleSecondCaseParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKASSIGNMENTOVERLAPPABLERULESECONDPARAM_H_
#define _CHECKASSIGNMENTOVERLAPPABLERULESECONDPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class CheckAssignmentOverlappableRule;
class CheckAssignmentOverlappableRuleParam;

class CheckAssignmentOverlappableSecondRuleParam : public RuleParam {
	friend class CheckAssignmentOverlappableRule;
	friend class CheckAssignmentOverlappableRuleParam;
private:
	explicit CheckAssignmentOverlappableSecondRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 6121;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 10;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		ASSIGNMENTS_A = 4,
		ASSIGNMENT_GROUPS_A = 5,
		IS_TRAINING_A = 6,
		ASSIGNMENTS_B = 7,
		ASSIGNMENT_GROUSP_B = 8,
		IS_TRAINING_B = 9
	};

	//crew的base，支持*和|分开的多个设置
	std::vector<std::string> _bases{};

	//crew的Rank，支持*和|分开的多个设置
	std::vector<std::string> _ranks{};

	//crew的Fleet，支持*和|分开的多个设置
	std::vector<std::string> _fleets{};

	//Crew的Team，支持*和|分开的多个设置
	std::vector<std::string> _teams{};

	//Pairing A或Ground Roster A的Assignment，支持*和|分开的多个设置
	std::vector<std::string> _assignmentsA{};

	//Pairing A或Ground Roster A的Assignment Group，支持*和|分开的多个设置
	std::vector<std::string> _assignmentGroupsA{};

	//Pairing A或Ground Roster A的是否包含Training，取值Y/N或*(忽略该参数)
	std::string _isTrainingA{};

	//Pairing B或Ground Roster B的Assignment，支持*和|分开的多个设置
	std::vector<std::string> _assignmentsB{};

	//Pairing B或Ground Roster B的Assignment Group，支持*和|分开的多个设置
	std::vector<std::string> _assignmentGroupsB{};

	//Pairing B或Ground Roster B的是否包含Training，取值Y/N或*(忽略该参数)
	std::string _isTrainingB{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

public:

	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchAssignment(const string assignment, const string checkType) const;

	bool MatchTraining(const ROSTER* roster, const string checkType) const;
};

#endif //_CHECKASSIGNMENTOVERLAPPABLERULESECONDPARAM_H_
