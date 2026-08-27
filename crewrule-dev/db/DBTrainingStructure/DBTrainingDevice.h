//
// Created by haoli on 2025/7/3.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGDEVICE_H
#define TRAININGOPTIMIZER_DBTRAININGDEVICE_H

#include "string"
#include <limits>
class DBTrainingDevice {
public:
    enum class Type {
        Classroom,
        E_Learning,
        Simulator
    };

    DBTrainingDevice(long long id, const std::string &name, const std::vector<std::string> &groups, Type type, const std::string &location,
                     unsigned int maximumCapacity, unsigned int designedCapacity, time_t effectiveStartTime, time_t effectiveEndTime) :
                     _id(id), _name(name), _groups(groups), _type(type), _location(location), _maximumCapacity(maximumCapacity), _designedCapacity(designedCapacity), _effectiveStartTime(effectiveStartTime), _effectiveEndTime(effectiveEndTime) {}

    const long long GetId() const { return _id; }

    void SetId(long long id) { _id = id; }

    const std::string &GetName() const { return _name; }

    void SetName(const std::string &name) { _name = name; }

    const std::vector<std::string> &GetGroups() const { return _groups; }

    void SetGroups(const std::vector<std::string> &groups) { _groups = groups; }

    const Type GetType() const { return _type; }

    void SetType(const Type type) { _type = type; }

    const std::string &GetLocation() const { return _location; }

    void SetLocation(const std::string &location) { _location = location; }

    const unsigned int GetMaximumCapacity() const { return _maximumCapacity; }

    void SetMaximumCapacity(unsigned int maximumCapacity) { _maximumCapacity = maximumCapacity; }

    const unsigned int GetDesignedCapacity() const { return _designedCapacity; }

    void SetDesignedCapacity(unsigned int designedCapacity) { _designedCapacity = designedCapacity; }

    const time_t GetEffectiveStartTime() const { return _effectiveStartTime; }

    void SetEffectiveStartTime(time_t effectiveStartTime) { _effectiveStartTime = effectiveStartTime; }

    const time_t GetEffectiveEndTime() const { return _effectiveEndTime; }

    void SetEffectiveEndTime(time_t effectiveEndTime) { _effectiveEndTime = effectiveEndTime; }
private:
    long long _id;
    std::string _name;
    std::vector<std::string> _groups;   // refer to dbDevice->resourceTypes
    Type _type;
    std::string _location;              //Airport three-letter-code
    unsigned int _maximumCapacity;      //Penalty may apply if above designed capacity but below maximum capacity. If left empty, use designedCapacity as maximum
    unsigned int _designedCapacity;     //No penalty if below designed capacity
    time_t _effectiveStartTime{0};
    time_t _effectiveEndTime{std::numeric_limits<time_t>::max()};
};


#endif //TRAININGOPTIMIZER_DBTRAININGDEVICE_H
