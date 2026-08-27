#pragma once
/**
 * @file CheckMaxLayoversInTripsForPairingRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-12-04
**/

#ifndef _CHECKMAXLAYOVERSINTRIPSFORPAIRINGRULEPARAM_H_
#define _CHECKMAXLAYOVERSINTRIPSFORPAIRINGRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckMaxLayoversInTripsForPairingRuleParam;

class CheckMaxLayoversInTripsForPairingRuleParam : public RuleParam {
    friend class CheckMaxLayoversInTripsForPairingRule;
private:
    explicit CheckMaxLayoversInTripsForPairingRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7222;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 1;

    enum class ParamLocation {
        PAIRING_BASES,
        LAYOVER_STATIONS,
        MAX_LAYOVER_TIMES,
        EFF_DATE,
        EXP_DATE
    };


    std::vector<std::string> _pairingBases{};
    std::vector<std::string> _layoverStations{};
    int _maxLayoverTimes{};
    time_t _effDate{};
    time_t _expDate{};


    void ParseParam(const DBRule& dbRule);

};

#endif //_CHECKMAXLAYOVERSINTRIPSFORPAIRINGRULEPARAM_H_
