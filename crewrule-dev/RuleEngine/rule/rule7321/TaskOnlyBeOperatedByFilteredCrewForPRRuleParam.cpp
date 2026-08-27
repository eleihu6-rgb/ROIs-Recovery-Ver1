/**
 * @file TaskOnlyBeOperatedByFilteredCrewForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-10-15
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "TaskOnlyBeOperatedByFilteredCrewForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void TaskOnlyBeOperatedByFilteredCrewForPRRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::CREW_BASES): {
				_strCrewBases = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _crewBases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CREW_RANKS): {
				_strCrewRanks = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _crewRanks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CREW_FLEETS): {
				_strCrewFleets = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _crewFleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CREW_NATIONALITIES): {
				_strCrewNationalities = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _crewNationalities);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::WITH_TEAMS): {
				_strCrewTeams = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _crewTeams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::WITHOUT_TEAMS): {
				_strCrewWithoutTeams = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _crewWithoutTeams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::WITH_QUALS): {
				_strCrewQuals = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _crewQuals);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::WITHOUT_QUALS): {
				_strCrewWithoutQuals = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _crewWithoutQuals);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_TYPES): {
				_strFlightTypes = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightTypes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SERVICE_TYPES): {
				_strFlightServiceTypes = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightServiceTypes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::AIRLINES): {
				_strFlightAirlines = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightAirlines);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_NUMBERS): {
				_strFlightNumbers = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightNumbers);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_FLEETS): {
				_strFlightFleets = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightFleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_SUB_FLEETS): {
				_strFlightSubFleets = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightSubFleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::AIRPORTS): {
				_strFlightAirports = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightAirports);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ROUTES): {
				_strFlightRoutes = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightRoutes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::AIRPORT_CATEGORIES): {
				_strFlightAirportCategories = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightAirportCategories);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TAIL_NUMBERS): {
				_strFlightTailNumbers = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightTailNumbers);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ATTRIBUTES): {
				_strAttributes = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _attributes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ACTING_RANKS): {
				_strActingRanks = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _actingRanks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENT_GROUPS): {
				_strAssignmentGroups = substr;
				_assignmentGroupsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENTS): {
				_strAssignments = substr;
				_assignmentMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::IS_TRAINING): {
				_strIsTraining = substr;
				_isTraining = (substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::TRAINING_ROLES): {
				_strTrainingRoles = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _trainingRoles);
				}
				_trainingRoleMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::SEVERITY):{
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void TaskOnlyBeOperatedByFilteredCrewForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Crew Bases,Crew Ranks,Crew Fleets,Crew Nationalities,With Teams,Without Teams,With Quals,Without Quals,Flight Types,Service Types,Airlines,Flight Numbers,Flight Fleets,Flight Sub-Fleets,Airports,Routes,Airport Categories,Tail Numbers,Pairing Attributes,Acting Ranks,Assignment Groups,Assignments,Is Training(Y/N),Training Roles
		if (header == "CREW BASES") {
			_strCrewBases = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _crewBases);
			}
		}
		else if (header == "CREW RANKS") {
			_strCrewRanks = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _crewRanks);
			}
		}
		else if (header == "CREW FLEETS") {
			_strCrewFleets = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _crewFleets);
			}
		}
		else if (header == "CREW NATIONALITIES") {
			_strCrewNationalities = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _crewNationalities);
			}
		}		
		else if (header == "WITH TEAMS") {
			_strCrewTeams = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _crewTeams);
			}
		}
		else if (header == "WITHOUT TEAMS") {
			_strCrewWithoutTeams = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _crewWithoutTeams);
			}			
		}
		else if (header == "WITH QUALS") {
			_strCrewQuals = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _crewQuals);
			}
		}
		else if (header == "WITHOUT QUALS") {
			_strCrewWithoutQuals = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _crewWithoutQuals);
			}			
		}
		else if (header == "FLIGHT TYPES" || header == "DIR") {
			_strFlightTypes = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightTypes);
			}			
		}
		else if (header == "SERVICE TYPES") {
			_strFlightServiceTypes = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightServiceTypes);
			}			
		}
		else if (header == "AIRLINES") {
			_strFlightAirlines = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightAirlines);
			}			
		}
		else if (header == "FLIGHT NUMBERS") {
			_strFlightNumbers = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightNumbers);
			}			
		}
		else if (header == "FLIGHT FLEETS") {
			_strFlightFleets = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightFleets);
			}			
		}
		else if (header == "FLIGHT SUB-FLEETS") {
			_strFlightSubFleets = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightSubFleets);
			}			
		}
		else if (header == "AIRPORTS") {
			_strFlightAirports = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightAirports);
			}			
		}
		else if (header == "ROUTES") {
			_strFlightRoutes = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightRoutes);
			}
		}
		else if (header == "AIRPORT CATEGORIES") {
			_strFlightAirportCategories = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightAirportCategories);
			}
		}
		else if (header == "TAIL NUMBERS") {
			_strFlightTailNumbers = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightTailNumbers);
			}			
		}
		else if (header == "PAIRING ATTRIBUTES" || header == "ATTRIBUTES") {
			_strAttributes = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _attributes);
			}			
		}
		else if (header == "ACTING RANKS") {
			_strActingRanks = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _actingRanks);
			}			
		}
		else if (header == "ASSIGNMENT GROUPS") {
			_strAssignmentGroups = headeValue;
			_assignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "ASSIGNMENTS") {
			_strAssignments = headeValue;
			_assignmentMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "IS TRAINING(Y/N)") {
			_strIsTraining = headeValue;
			_isTraining = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "TRAINING ROLES") {
			_strTrainingRoles = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _trainingRoles);
			}
			_trainingRoleMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//bool TaskOnlyBeOperatedByFilteredCrewForPRRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
//	std::vector<string> positions;
//	if (Utility::GetInstancePtr()->isCrewQualified(crew, _crewBases, _crewRanks, _crewFleets, _crewTeams, positions, checkedStartTime, checkedEndTime))
//		return true;
//	return false;
//}

bool TaskOnlyBeOperatedByFilteredCrewForPRRuleParam::MatchAttributes(const ROSTER* roster) const {
	if (_attributes.empty()) {
		return true;
	}

	bool foundAttr = false;
	std::vector<std::string> attributes;
	if (roster->pairing == nullptr) {
		split(roster->attribute, '|', attributes);
	}
	else{
		split(roster->pairing->getAttribute(), '|', attributes);
	}
	for (const auto& attr : attributes) {
		if (std::find(_attributes.begin(), _attributes.end(), attr) != _attributes.end()) {
			foundAttr = true;
			break;
		}
	}
	return foundAttr;
}

bool TaskOnlyBeOperatedByFilteredCrewForPRRuleParam::MatchFlightAirportCategories(const Segment* segment) const {
	if (_flightAirportCategories.empty()) {
		return true;
	}

	auto& dbData = this->GetRule()->GetDataContext();

	//出发机场
	auto iterDepAirport = dbData->airportCodeMap.find(segment->getDepStationRead());
	if (iterDepAirport == dbData->airportCodeMap.end()) {
		return false;
	}
	auto& depAirport = iterDepAirport->second;

	//到达机场
	auto iterArrAirport = dbData->airportCodeMap.find(segment->getArrStationRead());
	if (iterArrAirport == dbData->airportCodeMap.end()) {
		return false;
	}
	auto& arrAirport = iterArrAirport->second;


	if (!_flightAirportCategories.empty() && std::find(_flightAirportCategories.begin(), _flightAirportCategories.end(), depAirport->category) == _flightAirportCategories.end()
		&& std::find(_flightAirportCategories.begin(), _flightAirportCategories.end(), arrAirport->category) == _flightAirportCategories.end()) {
		return false;
	}

	return true;
}

bool TaskOnlyBeOperatedByFilteredCrewForPRRuleParam::MatchFlightRoutes(const Segment* segment) const {
	if (_flightRoutes.empty()) {
		return true;
	}
	string route = segment->getDepStationRead() + "-" + segment->getArrStationRead();
	return std::find(_flightRoutes.begin(), _flightRoutes.end(), route) != _flightRoutes.end();
}

bool TaskOnlyBeOperatedByFilteredCrewForPRRuleParam::MatchActingRankAndIsTraining(const ROSTER* roster, const Segment* segment) const {
	if (_isTraining == nullptr && _actingRanks.empty()) {
		return true;
	}
	if (segment == nullptr) {
		//地面任务，判断是否培训任务
		return !roster->tmRole.empty();
	}

	auto& dbData = this->GetRule()->GetDataContext();
	auto rf = dbData->rosterFlightMgr.get(segment->getDBId(), roster->idcrew);
	if (rf == nullptr) {
		//此时数据异常,认为未匹配到
		return false;
	}

	if (_isTraining != nullptr && rf->isTrainingFlight() != *_isTraining) {
		return false;
	}

	if (!_actingRanks.empty() && std::find(_actingRanks.begin(), _actingRanks.end(), rf->actingRank) == _actingRanks.end()) {
		return false;
	}

	return true;
}

bool TaskOnlyBeOperatedByFilteredCrewForPRRuleParam::MatchTrainingRoles(const ROSTER* roster, const Segment* segment) const {
	if (_trainingRoles.empty()) {
		return true;
	}
	if (segment == nullptr) {
		//地面任务，检查角色
		return std::find(_trainingRoles.begin(), _trainingRoles.end(), roster->tmRole) == _trainingRoles.end();
	}
	vector<long long> flightIds;
	if (segment != nullptr) {
		flightIds.emplace_back(segment->getDBId());
	}

	return _trainingRoleMatch.Match(*roster, flightIds);
}

bool TaskOnlyBeOperatedByFilteredCrewForPRRuleParam::MatchCrewNationalities(const std::shared_ptr<CREW>& crew) const {
	if (_crewNationalities.empty()) {
		return true;
	}
	return std::find(_crewNationalities.begin(), _crewNationalities.end(), crew->nationality) != _crewNationalities.end();
}

bool TaskOnlyBeOperatedByFilteredCrewForPRRuleParam::MatchFlight(const ROSTER* roster, const Segment* segment) const {
	auto& dbData = this->GetRule()->GetDataContext();

	//航班类别
	if (!_flightTypes.empty() && std::find(_flightTypes.begin(), _flightTypes.end(), segment->getDomIntType()) == _flightTypes.end()) {
		return false;
	}

	//航班Serice Type
	if (!_flightServiceTypes.empty() && std::find(_flightServiceTypes.begin(), _flightServiceTypes.end(), segment->getServiceType()) == _flightServiceTypes.end()) {
		return false;
	}

	//航班号中航空公司
	if (!_flightAirlines.empty() && std::find(_flightAirlines.begin(), _flightAirlines.end(), segment->getAirline()) == _flightAirlines.end()) {
		return false;
	}

	//航班号（不包括航司代码）
	if (!_flightNumbers.empty() && std::find(_flightNumbers.begin(), _flightNumbers.end(), segment->getFlightNumber()) == _flightNumbers.end()) {
		return false;
	}

	//航班机型
	if (!_flightFleets.empty() && std::find(_flightFleets.begin(), _flightFleets.end(), segment->getFleetCD()) == _flightFleets.end()) {
		return false;
	}

	//航班子机型
	if (!_flightSubFleets.empty() && std::find(_flightSubFleets.begin(), _flightSubFleets.end(), segment->getSubFleet()) == _flightSubFleets.end()) {
		return false;
	}

	//航班飞机机尾号
	if (!_flightTailNumbers.empty() && std::find(_flightTailNumbers.begin(), _flightTailNumbers.end(), segment->getTailNum()) == _flightTailNumbers.end()) {
		return false;
	}

	//航班出发或落地机场
	if (!_flightAirports.empty() && ((std::find(_flightAirports.begin(), _flightAirports.end(), segment->getDepStationRead()) == _flightAirports.end())
		&& (std::find(_flightAirports.begin(), _flightAirports.end(), segment->getArrStationRead()) == _flightAirports.end()))) {
		return false;
	}

	//航班航线
	if (!MatchFlightRoutes(segment)) {
		return false;
	}

	//航班航班出发活落地机场类别
	if (!MatchFlightAirportCategories(segment)) {
		return false;
	}

	//航班assignment group列表
	if (!_assignmentGroupsMatch.Match(*segment)) {
		return false;
	}

	//航班assignment列表
	if (!_assignmentMatch.Match(*segment)) {
		return false;
	}

	//机组人员在该航班Acting rank列表，以及 是否是培训
	if (!MatchActingRankAndIsTraining(roster, segment)) {
		return false;
	}

	//RosterGround或航班所在Pairing的attribute
	if (!MatchAttributes(roster)) {
		return false;
	}

	//培训角色
	if (!MatchTrainingRoles(roster, segment)) {
		return false;
	}
	return true;
}

bool TaskOnlyBeOperatedByFilteredCrewForPRRuleParam::MatchGroundRoster(const ROSTER* roster) const {
	auto& dbData = this->GetRule()->GetDataContext();

	//航班类别
	if (!_flightTypes.empty()) {
		return false;
	}

	//航班Serice Type
	if (!_flightServiceTypes.empty()) {
		return false;
	}

	//航班号中航空公司
	if (!_flightAirlines.empty()) {
		return false;
	}

	//航班号（不包括航司代码）
	if (!_flightNumbers.empty()) {
		return false;
	}

	//航班机型
	if (!_flightFleets.empty()) {
		return false;
	}

	//航班子机型
	if (!_flightSubFleets.empty()) {
		return false;
	}

	//航班飞机机尾号
	if (!_flightTailNumbers.empty()) {
		return false;
	}

	//航班出发或落地机场
	if (!_flightAirports.empty()) {
		return false;
	}

	//航班航线
	if (!_flightRoutes.empty()) {
		return false;
	}

	//航班航班出发活落地机场类别
	if (!_flightAirportCategories.empty()) {
		return false;
	}

	//航班所在Pairing的attribute
	if (!_attributes.empty()) {
		return false;
	}

	//航班assignment group列表
	if (!_assignmentGroupsMatch.Match(*roster)) {
		return false;
	}

	//航班assignment列表
	if (!_assignmentMatch.Match(*roster)) {
		return false;
	}

	//机组人员在该航班Acting rank列表，以及 是否是培训
	if (!MatchActingRankAndIsTraining(roster, nullptr)) {
		return false;
	}

	//培训角色
	if (!MatchTrainingRoles(roster, nullptr)) {
		return false;
	}
	return true;
}

bool TaskOnlyBeOperatedByFilteredCrewForPRRuleParam::MatchCrew(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {

	std::vector<string> positions;
	if (!roster->isAllValid(_crewBases, _crewRanks, _crewFleets, _crewTeams, positions)) {
		return false;
	}

	if (!roster->isValidQual(_crewQuals)) {
		return false;
	}

	if (!_crewWithoutTeams.empty() && roster->isValidTeam(_crewWithoutTeams)) {
		return false;
	}

	if (!_crewWithoutQuals.empty() && roster->isValidQual(_crewWithoutQuals)) {
		return false;
	}

	return true;
}

string TaskOnlyBeOperatedByFilteredCrewForPRRuleParam::GetCrewFilterConditionDesc() const {
	stringstream ss;
	if (!_strCrewBases.empty() && _strCrewBases != RuleParamConstant::ALL) {
		ss << "/" << _strCrewBases;
	}
	if (!_strCrewRanks.empty() && _strCrewRanks != RuleParamConstant::ALL) {
		ss << "/" << _strCrewRanks;
	}
	if (!_strCrewFleets.empty() && _strCrewFleets != RuleParamConstant::ALL) {
		ss << "/" << _strCrewFleets;
	}
	if (!_strCrewNationalities.empty() && _strCrewNationalities != RuleParamConstant::ALL) {
		ss << "/" << _strCrewNationalities;
	}
	if (!_strCrewTeams.empty() && _strCrewTeams != RuleParamConstant::ALL) {
		ss << "/" << _strCrewTeams;
	}
	if (!_strCrewWithoutTeams.empty() && _strCrewWithoutTeams != RuleParamConstant::ALL) {
		ss << "/" << _strCrewWithoutTeams;
	}
	if (!_strCrewQuals.empty() && _strCrewQuals != RuleParamConstant::ALL) {
		ss << "/" << _strCrewQuals;
	}
	if (!_strCrewWithoutQuals.empty() && _strCrewWithoutQuals != RuleParamConstant::ALL) {
		ss << "/" << _strCrewWithoutQuals;
	}

	string result = ss.str();
	return result.empty() ? "" : result.substr(1);
}

string TaskOnlyBeOperatedByFilteredCrewForPRRuleParam::GetTaskFilterConditionDesc() const {
	stringstream ss;
	if (!_strFlightTypes.empty() && _strFlightTypes != RuleParamConstant::ALL) {
		ss << "/" << _strFlightTypes;
	}
	if (!_strFlightServiceTypes.empty() && _strFlightServiceTypes != RuleParamConstant::ALL) {
		ss << "/" << _strFlightServiceTypes;
	}
	if (!_strFlightAirlines.empty() && _strFlightAirlines != RuleParamConstant::ALL) {
		ss << "/" << _strFlightAirlines;
	}
	if (!_strFlightNumbers.empty() && _strFlightNumbers != RuleParamConstant::ALL) {
		ss << "/" << _strFlightNumbers;
	}
	if (!_strFlightFleets.empty() && _strFlightFleets != RuleParamConstant::ALL) {
		ss << "/" << _strFlightFleets;
	}
	if (!_strFlightSubFleets.empty() && _strFlightSubFleets != RuleParamConstant::ALL) {
		ss << "/" << _strFlightSubFleets;
	}
	if (!_strFlightAirports.empty() && _strFlightAirports != RuleParamConstant::ALL) {
		ss << "/" << _strFlightAirports;
	}
	if (!_strFlightRoutes.empty() && _strFlightRoutes != RuleParamConstant::ALL) {
		ss << "/" << _strFlightRoutes;
	}
	if (!_strFlightAirportCategories.empty() && _strFlightAirportCategories != RuleParamConstant::ALL) {
		ss << "/" << _strFlightAirportCategories;
	}
	if (!_strFlightTailNumbers.empty() && _strFlightTailNumbers != RuleParamConstant::ALL) {
		ss << "/" << _strFlightTailNumbers;
	}
	if (!_strAttributes.empty() && _strAttributes != RuleParamConstant::ALL) {
		ss << "/" << _strAttributes;
	}
	if (!_strActingRanks.empty() && _strActingRanks != RuleParamConstant::ALL) {
		ss << "/" << _strActingRanks;
	}
	if (!_strAssignmentGroups.empty() && _strAssignmentGroups != RuleParamConstant::ALL) {
		ss << "/" << _strAssignmentGroups;
	}
	if (!_strAssignments.empty() && _strAssignments != RuleParamConstant::ALL) {
		ss << "/" << _strAssignments;
	}
	if (!_strIsTraining.empty() && _strIsTraining != RuleParamConstant::ALL) {
		ss << "/" << _strIsTraining;
	}
	if (!_strTrainingRoles.empty() && _strTrainingRoles != RuleParamConstant::ALL) {
		ss << "/" << _strTrainingRoles;
	}

	string result = ss.str();
	return result.empty() ? "" : result.substr(1);
}