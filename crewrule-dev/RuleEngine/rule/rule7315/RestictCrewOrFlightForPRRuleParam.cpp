/**
 * @file RestictCrewOrFlightForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-09-04
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "RestictCrewOrFlightForPRRuleParam.h"
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

void RestictCrewOrFlightForPRRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::CREW_BASES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _crewBases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CREW_RANKS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _crewRanks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CREW_FLEETS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _crewFleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CREW_TEAMS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _crewTeams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CREW_QUALS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _crewQuals);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CREW_NATIONALITIES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _crewNationalities);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_COMPOSITIONS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightCompositions);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_COMPOSITION_OPTIONS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightCompositionOptions);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightAssignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_COUNTRIES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightCountries);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_AIRPORT_CATEGORIES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightAirportCategories);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_AIRPORTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightAirports);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_AIRLINES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightAirlines);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_NUMBERS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightNumbers);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_TYPES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightTypes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_FLEETS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightFleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_SUB_FLEETS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightSubFleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TAIL_NUMBERS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightTailNumbers);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SERVICE_TYPES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightServiceTypes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ACTING_RANKS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _actingRanks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::PAIRING_ATTRIBUTES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _pairingAttributes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RESTICT_CREW_OR_FLIGHT): {
				_restictCrewOrFlight = strToUpper(substr);
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

void RestictCrewOrFlightForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Crew Bases,Crew Ranks,Crew Fleets,Crew Teams,Crew Quals,Crew Nationalities,Flight Compositions,Flight Composition Options,Flight Assignments,Flight Countries,Flight Airport Categories,Flight Airports,Flight Airlines,Flight Numbers,Flight Types,Flight Fleets,Flight Sub-Fleets,Tail Numbers,Service Types,Acting Ranks,Pairing Attributes,Restict Crew or Flight(C/F)
		if (header == "CREW BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _crewBases);
			}
		}
		else if (header == "CREW RANKS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _crewRanks);
			}
		}
		else if (header == "CREW FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _crewFleets);
			}
		}
		else if (header == "CREW TEAMS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _crewTeams);
			}
		}
		else if (header == "CREW QUALS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _crewQuals);
			}
		}
		else if (header == "CREW NATIONALITIES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _crewNationalities);
			}
		}
		else if (header == "FLIGHT COMPOSITIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightCompositions);
			}
		}
		else if (header == "FLIGHT COMPOSITION OPTIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightCompositionOptions);
			}
		}
		else if (header == "FLIGHT ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightAssignments);
			}
		}
		else if (header == "FLIGHT COUNTRIES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightCountries);
			}
		}
		else if (header == "FLIGHT AIRPORT CATEGORIES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightAirportCategories);
			}
		}
		else if (header == "FLIGHT AIRPORTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightAirports);
			}
		}
		else if (header == "FLIGHT AIRLINES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightAirlines);
			}
		}
		else if (header == "FLIGHT NUMBERS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightNumbers);
			}
		}
		else if (header == "FLIGHT TYPES" || header == "DIR") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightTypes);
			}
		}
		else if (header == "FLIGHT FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightFleets);
			}
		}
		else if (header == "FLIGHT SUB-FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightSubFleets);
			}
		}
		else if (header == "TAIL NUMBERS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightTailNumbers);
			}
		}
		else if (header == "SERVICE TYPES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightServiceTypes);
			}
		}
		else if (header == "ACTING RANKS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _actingRanks);
			}
		}
		else if (header == "PAIRING ATTRIBUTES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _pairingAttributes);
			}
		}
		else if (header == "RESTICT CREW OR FLIGHT(C/F)") {
			_restictCrewOrFlight = strToUpper(headeValue);
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool RestictCrewOrFlightForPRRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _crewBases, _crewRanks, _crewFleets, _crewTeams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool RestictCrewOrFlightForPRRuleParam::MatchPairingAttributes(const ROSTER* roster) const {
	if (_pairingAttributes.empty()) {
		return true;
	}
	if (roster->pairing == nullptr) {
		return false;
	}
	bool foundAttr = false;
	std::vector<std::string> attributes;
	split(roster->pairing->getAttribute(), '|', attributes);
	for (const auto& attr : attributes) {
		if (std::find(_pairingAttributes.begin(), _pairingAttributes.end(), attr) != _pairingAttributes.end()) {
			foundAttr = true;
			break;
		}
	}
	return foundAttr;
}

bool RestictCrewOrFlightForPRRuleParam::MatchFlightCountries(const Segment* segment) const {
	if (_flightCountries.empty() && _flightAirportCategories.empty()) {
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


	if (!_flightCountries.empty() && _flightCountries.find(depAirport->country) == _flightCountries.end()
		&& _flightCountries.find(arrAirport->country) == _flightCountries.end()) {
		return false;
	}

	if (!_flightAirportCategories.empty() && _flightAirportCategories.find(depAirport->category) == _flightAirportCategories.end()
		&& _flightAirportCategories.find(arrAirport->category) == _flightAirportCategories.end()) {
		return false;
	}
	
	return true;
}

bool RestictCrewOrFlightForPRRuleParam::MatchFlightCompositionOption(const Segment* segment) const {
	if (_flightCompositions.empty()) {
		return true;
	}
	auto& dbData = this->GetRule()->GetDataContext();

	auto segmentCompositionOptions = SegmentUtils::GetCompositionOptions(segment, dbData);
	for (auto& segmentCompositionOption : segmentCompositionOptions) {
		auto& [compId, compName, option] = segmentCompositionOption;
		if (_flightCompositions.find(compName) == _flightCompositions.cend()) {
			continue;
		}
		if (_flightCompositionOptions.empty()) {
			return true;
		}
		else {
			if (std::find(_flightCompositionOptions.begin(), _flightCompositionOptions.end(), option) != _flightCompositionOptions.cend()) {
				return true;
			}
		}
	}

	return false;
}

bool RestictCrewOrFlightForPRRuleParam::MatchCrewNationalities(const std::shared_ptr<CREW>& crew) const {
	if (_crewNationalities.empty()) {
		return true;
	}
	return _crewNationalities.find(crew->nationality) != _crewNationalities.end();
}

bool RestictCrewOrFlightForPRRuleParam::MatchFlight(const ROSTER* roster, const Segment* segment) const {
	auto& dbData = this->GetRule()->GetDataContext();

	//航班出发或落地机场
	if (!_flightAirports.empty() && ((_flightAirports.find(segment->getDepStationRead()) == _flightAirports.end())
		&& (_flightAirports.find(segment->getArrStationRead()) == _flightAirports.end()))) {
		return false;
	}

	//航班号中航空公司
	if (!_flightAirlines.empty() && _flightAirlines.find(segment->getAirline()) == _flightAirlines.end()) {
		return false;
	}

	//航班号（不包括航司代码）
	if (!_flightNumbers.empty() && _flightNumbers.find(segment->getFlightNumber()) == _flightNumbers.end()) {
		return false;
	}

	//航班类别
	if (!_flightTypes.empty() && _flightTypes.find(segment->getDomIntType()) == _flightTypes.end()) {
		return false;
	}

	//航班机型
	if (!_flightFleets.empty() && _flightFleets.find(segment->getFleetCD()) == _flightFleets.end()) {
		return false;
	}

	//航班子机型
	if (!_flightSubFleets.empty() && _flightSubFleets.find(segment->getSubFleet()) == _flightSubFleets.end()) {
		return false;
	}

	//航班飞机机尾号
	if (!_flightTailNumbers.empty() && _flightTailNumbers.find(segment->getTailNum()) == _flightTailNumbers.end()) {
		return false;
	}

	//航班Serice Type
	if (!_flightServiceTypes.empty() && _flightServiceTypes.find(segment->getServiceType()) == _flightServiceTypes.end()) {
		return false;
	}

	//航班assignment列表
	if (!_flightAssignments.empty() && _flightAssignments.find(segment->getAssignment()) == _flightAssignments.end()) {
		return false;
	}

	//航班出发或落地国家 和 航班出发活落地机场类别
	if (!MatchFlightCountries(segment)) {
		return false;
	}

	//机组人员在该航班Acting rank列表。多个值使用“|”分隔并支持*通配
	if (!_actingRanks.empty()) {
		auto rf = dbData->rosterFlightMgr.get(segment->getDBId(), roster->idcrew);
		if (rf != nullptr && _actingRanks.find(rf->actingRank) == _actingRanks.end()) {
			return false;
		}
	}

	//航班所在Pairing的attribute
	if (!MatchPairingAttributes(roster)) {
		return false;
	}

	//航班配比 以及 航班配比option
	if (!MatchFlightCompositionOption(segment)) {
		return false;
	}
	return true;
}

bool RestictCrewOrFlightForPRRuleParam::MatchCrew(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {

	std::vector<string> positions;
	if (!roster->isAllValid(_crewBases, _crewRanks, _crewFleets, _crewTeams, positions)) {
		return false;
	}

	if (!roster->isValidQual(_crewQuals)) {
		return false;
	}
	return true;
}