/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/1/9 10:46
 * @File:    DBBid.cpp
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/

#include "CrewDB.h"

const std::unordered_map<std::string, Bid::SatisfactionCriteria> Bid::SatisfactionCriteriaMap{
        {"Any",        Bid::SatisfactionCriteria::Any},
        {"All",        Bid::SatisfactionCriteria::All},
        {"Percentage", Bid::SatisfactionCriteria::Percentage},
};

const std::unordered_map<std::string, BidRequirement::Type> BidRequirement::TypeMap{
        {"AL",      BidRequirement::Type::AL},
        {"BDO",     BidRequirement::Type::BDO},
        {"TOF",     BidRequirement::Type::TimeOff},
        {"LO",      BidRequirement::Type::LO},
        {"RDO",     BidRequirement::Type::RDO},
        {"FLT",     BidRequirement::Type::FLT},
        {"Route",   BidRequirement::Type::Route},
        {"Turnaround", BidRequirement::Type::Turnaround},
        {"Layover", BidRequirement::Type::Layover},
        {"Attribute", BidRequirement::Type::Attribute},
        {"Unknown", BidRequirement::Type::Unknown},
};

const std::unordered_map<std::string, BiddingSequenceGroup::Type> BiddingSequenceGroup::TypeMap{
        {"Personal", BiddingSequenceGroup::Type::Personal},
        {"Collective", BiddingSequenceGroup::Type::Collective}
};
