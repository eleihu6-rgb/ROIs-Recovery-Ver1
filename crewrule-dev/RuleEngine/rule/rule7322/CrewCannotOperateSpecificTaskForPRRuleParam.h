/**
 * @file CrewCannotOperateSpecificTaskForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-10-15
**/

#ifndef _CREWCANNOTOPERATESPECIFICTASKFORPRRULEPARAM_H_
#define _CREWCANNOTOPERATESPECIFICTASKFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "matcher/TrainingRoleMatchExpression.h"

class CrewCannotOperateSpecificTaskForPRRule;

class CrewCannotOperateSpecificTaskForPRRuleParam : public RuleParam {
	friend class CrewCannotOperateSpecificTaskForPRRule;
private:
    explicit CrewCannotOperateSpecificTaskForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7322;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 25;

    enum class ParamLocation {
		CREW_BASES = 1,
		CREW_RANKS = 2,
		CREW_FLEETS = 3,
		CREW_NATIONALITIES = 4,
		WITH_TEAMS = 5,
		WITHOUT_TEAMS = 6,
		WITH_QUALS = 7,
		WITHOUT_QUALS = 8,
		FLIGHT_TYPES = 9,
		SERVICE_TYPES = 10,
		AIRLINES = 11,
		FLIGHT_NUMBERS = 12,
		FLIGHT_FLEETS = 13,
		FLIGHT_SUB_FLEETS = 14,
		AIRPORTS = 15,
		ROUTES = 16,
		AIRPORT_CATEGORIES = 17,
		TAIL_NUMBERS = 18,
		PAIRING_ATTRIBUTES = 19,
		ACTING_RANKS = 20,
		ASSIGNMENT_GROUPS = 21,
		ASSIGNMENTS = 22,
		IS_TRAINING = 23,
		TRAINING_ROLES = 24,
		SEVERITY = 25
    };

	//机组人员所属基地列表。使用“|”分隔，表示多个值
	string _strCrewBases;
	vector<string> _crewBases{};

	//机组人员级别列表。使用“|”分隔，表示多个值
	string _strCrewRanks;
	vector<string> _crewRanks{};

	//机组人员机型列表。使用“|”分隔，表示多个值
	string _strCrewFleets;
	vector<string> _crewFleets{};

	//机组人员国籍列表。多个值使用“|”分隔并支持*通配
	string _strCrewNationalities;
	vector<string> _crewNationalities{};

	//机组人员所在团队列表。多个值使用“|”分隔并支持*通配
	string _strCrewTeams;
	vector<string> _crewTeams{};

	//机组人员不能在团队列表。多个值使用“|”分隔并支持*通配
	string _strCrewWithoutTeams;
	vector<string> _crewWithoutTeams{};

	//机组人员具备资质列表。多个值使用“|”分隔并支持*通配
	string _strCrewQuals;
	vector<string> _crewQuals{};

	//机组人员不具备资质列表。多个值使用“|”分隔并支持*通配
	string _strCrewWithoutQuals;
	vector<string> _crewWithoutQuals{};

	//航班类别列表。多个值使用“|”分隔并支持*通配。取值：D - 国内，I - 国际，R - 区域，来自airport表dir字段。
	string _strFlightTypes;
	vector<string> _flightTypes{};

	//航班Serice Type列表。多个值使用“|”分隔并支持*通配。取值：来自航班表的service type字段
	string _strFlightServiceTypes;
	vector<string> _flightServiceTypes{};

	//航班号中航空公司列表。多个值使用“|”分隔并支持*通配
	string _strFlightAirlines;
	vector<string> _flightAirlines{};

	//航班号列表（不包括航司代码）。多个值使用“|”分隔并支持*通配
	string _strFlightNumbers;
	vector<string> _flightNumbers{};

	//航班机型列表。多个值使用“|”分隔并支持*通配
	string _strFlightFleets;
	vector<string> _flightFleets{};

	//航班子机型列表。多个值使用“|”分隔并支持*通配
	string _strFlightSubFleets;
	vector<string> _flightSubFleets{};

	//航班出发或落地机场列表。多个值使用“|”分隔并支持*通配
	string _strFlightAirports;
	vector<string> _flightAirports{};

	//航班起飞降落航线列表。格式：起飞机场-落地机场。起飞降落机场用“- ”分开，多个值使用“|”分隔并支持*通配。如：PEK-MNL|MNL-PEK
	string _strFlightRoutes;
	vector<string> _flightRoutes{};

	//航班出发活落地机场类别列表。多个值使用“|”分隔并支持*通配。取值：来自airport表category字段
	string _strFlightAirportCategories;
	vector<string> _flightAirportCategories{};

	//航班飞机机尾号列表。多个值使用“|”分隔并支持*通配
	string _strFlightTailNumbers;
	vector<string> _flightTailNumbers{};

	//航班所在Pairing的attribute列表。多个值使用“|”分隔并支持*通配
	string _strPairingAttributes;
	vector<string> _pairingAttributes{};

	//机组人员在该航班Acting rank列表。多个值使用“|”分隔并支持*通配
	string _strActingRanks;
	vector<string> _actingRanks{};

	//Flight或者地面任务的任务类型组列表。多个值使用“|”分隔并支持*通配
	string _strAssignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _assignmentGroupsMatch;

	//航班或者地面任务的任务类型列表。多个值使用“|”分隔并支持*通配
	string _strAssignments{};
	AssignmentMatchExpression<Activity> _assignmentMatch;

	//是否是航班或地面的培训任务。取值：Y/N
	string _strIsTraining;
	std::shared_ptr<bool> _isTraining{nullptr};

	//航班或地面培训的角色列表。多个值使用“|”分隔并支持*通配
	string _strTrainingRoles;
	vector<string> _trainingRoles{};
	TrainingRoleMatchExpression<Activity> _trainingRoleMatch;

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	//bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchPairingAttributes(const ROSTER* roster) const;

	bool MatchFlightAirportCategories(const Segment* segment) const;

	bool MatchFlightRoutes(const Segment* segment) const;

	bool MatchActingRankAndIsTraining(const ROSTER* roster, const Segment* segment) const;

	bool MatchTrainingRoles(const ROSTER* roster, const Segment* segment) const;

public:

	bool MatchFlight(const ROSTER* roster, const Segment* segment) const;

	bool MatchGroundRoster(const ROSTER* roster) const;

	bool MatchCrewNationalities(const std::shared_ptr<CREW>& crew) const;

	bool MatchCrew(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

	string GetCrewFilterConditionDesc() const;

	string GetTaskFilterConditionDesc() const;
};

#endif //_CREWCANNOTOPERATESPECIFICTASKFORPRRULEPARAM_H_
