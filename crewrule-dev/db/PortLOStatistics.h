//
// Created by Nan on 2025/1/2.
//

#ifndef RULEENGINEFRAMEWORK_PORTLOSTATISTICS_H
#define RULEENGINEFRAMEWORK_PORTLOSTATISTICS_H
#include<string>

//---------- historical layover airport and flight record for each crew
struct PORT_LO_STATISTICS {
    std::string id = "";
    std::string crewId = "";
    std::string layoverPort = "";
    std::string flightNumber = "";
    time_t startDate = 0;
    time_t endDate = 0;
    int layoverCount = 0;
    std::string type = "";
};
#endif //RULEENGINEFRAMEWORK_PORTLOSTATISTICS_H
