# Stub mínimo de SketchUp para smoke-test
class Numeric; def mm; self.to_f; end; def degrees; self*Math::PI/180; end; end
$profiles=0
module Geom
  class Point3d; def initialize(*a); @a=a; end; end
  class Vector3d
    def initialize(x=0,y=0,z=0); @x=x;@y=y;@z=z; end
    def length; Math.sqrt(@x*@x+@y*@y+@z*@z); end
    def normalize!; l=length; l=1 if l==0; @x/=l;@y/=l;@z/=l; self; end
    def parallel?(o); false; end
    def cross(o); Vector3d.new(0,0,1); end
  end
  class Transformation
    def initialize(*a); end
    def self.rotation(*a); new; end
    def self.axes(*a); new; end
    def self.scaling(*a); new; end
    def *(o); self; end
  end
end
ORIGIN=Object.new; X_AXIS=Geom::Vector3d.new(1,0,0); Z_AXIS=Geom::Vector3d.new(0,0,1)
class Face
  def pushpull(d); end
  def reverse!; end
  def normal; Struct.new(:z).new(1.0); end
end
class Bounds
  def min; Struct.new(:x,:y,:z).new(0.0,0.0,0.0); end
end
class Entities
  def add_face(pts); $profiles+=1; Face.new; end
  def add_group; Group.new; end
  def add_text(s,pt,v=nil); nil; end
  def grep(k); []; end
end
class Group
  def entities; Entities.new; end
  def bounds; Bounds.new; end
  def transform!(t); end
  def material=(m); end
  def layer=(l); end
  def name=(n); end
  def explode; end
end
class Layers; def add(n); n; end; def [](n); n; end; end
class View; def zoom_extents; end; end
class Mat; attr_accessor :color, :alpha; def initialize(*a); end; end
class Materials; def add(n); Mat.new; end; end
class Model
  def start_operation(*a); end
  def commit_operation; end
  def active_entities; Entities.new; end
  def layers; Layers.new; end
  def active_view; View.new; end
  def materials; Materials.new; end
end
module Sketchup
  def self.active_model; @@m||=Model.new; end
  class Color; def initialize(*a); end; end
end
# validate.js reemplaza esta línea por el .rb a probar. También podés usar ADAMANT_RB.
load(ENV['ADAMANT_RB'] || '/home/claude/casa_test.rb')
puts "PERFILES GENERADOS: #{$profiles}"
