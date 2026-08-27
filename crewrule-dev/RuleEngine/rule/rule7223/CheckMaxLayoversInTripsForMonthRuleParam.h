#pragma once
/**
 * @file CheckMaxLayoversInTripsForMonthRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-12-04
**/

#ifndef _CHECKMAXLAYOVERSINTRIPSFORMONTHRULEPARAM_H_
#define _CHECKMAXLAYOVERSINTRIPSFORMONTHRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckMaxLayoversInTripsForMonthRuleParam;

class CheckMaxLayoversInTripsForMonthRuleParam : public RuleParam {
    friend class CheckMaxLayoversInTripsForMonthRule;
private:
    explicit CheckMaxLayoversInTripsForMonthRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7223;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 1;

    enum class ParamLocation {
        BASES,
        RANKS,
        FLEETS,
        TEAMS,
        FLIGHT_NUMBERS,
        LAYOVER_STATIONS,
        PERIOD,
        UNIT,
        MAX_LAYOVER_TIMES
    };

    std::vector<std::string> _bases;
    std::vector<std::string> _ranks;
    std::vector<std::string> _fleets;
    std::vector<std::string> _teams;
    std::vector<std::string> _flightNumbers;
    std::vector<std::string> _layoverStations;
    int _period{};
    std::string _unit;
    int _maxLayoverTimes{};



    void ParseParam(const DBRule& dbRule);

};

#endif //_CHECKMAXLAYOVERSINTRIPSFORMONTHRULEPARAM_H_
